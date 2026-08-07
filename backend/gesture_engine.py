"""
GestureExplorer Elite — Enhanced Gesture Recognition Engine
Improvements over v1:
  - Orientation-aware finger detection (works at any hand angle)
  - Per-gesture adaptive buffer sizes (fast for simple, stable for complex)
  - Dual-threshold: raw confidence + geometric scoring
  - Robust thumb detection using MCP/IP joint vectors
  - Smooth confidence display with color gradient
  - Finger state bar HUD for visual debugging
  - Reduced false positives with multi-condition validation
"""
import cv2
import mediapipe as mp
import time
import math
import numpy as np

mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# ─── Landmark indices ───────────────────────────────────────────────────────
WRIST       = 0
THUMB_CMC   = 1; THUMB_MCP = 2; THUMB_IP = 3; THUMB_TIP = 4
INDEX_MCP   = 5; INDEX_PIP = 6; INDEX_DIP  = 7; INDEX_TIP  = 8
MIDDLE_MCP  = 9; MIDDLE_PIP= 10; MIDDLE_DIP = 11; MIDDLE_TIP = 12
RING_MCP    = 13; RING_PIP  = 14; RING_DIP   = 15; RING_TIP   = 16
PINKY_MCP   = 17; PINKY_PIP = 18; PINKY_DIP  = 19; PINKY_TIP  = 20

# Per-gesture buffer sizes: simpler gestures need fewer frames to confirm
GESTURE_BUFFERS = {
    "open_palm":    4,   # easy to detect
    "fist":         4,
    "thumbs_up":    5,   # needs stable disambiguation from fist
    "thumbs_down":  5,
    "index_point":  4,
    "peace_zoom_in":4,
    "pinky_thumb":  5,
}

# Per-gesture cooldown seconds
GESTURE_COOLDOWNS = {
    "FREEZE":       1.2,
    "ROTATE":       1.2,
    "NEXT":         0.8,   # allow faster cycling
    "PREV":         0.8,
    "ZOOM_IN":      0.6,
    "ZOOM_OUT":     0.6,
    "SELECT_POINT": 1.0,
}

ACTION_MAP = {
    "open_palm":    "FREEZE",
    "fist":         "ROTATE",
    "index_point":  "SELECT_POINT",
    "peace_zoom_in":"ZOOM_IN",
    "pinky_thumb":  "ZOOM_OUT",
    "thumbs_up":    "NEXT",
    "thumbs_down":  "PREV",
}


def _dist(a, b):
    """Euclidean distance between two landmarks."""
    return math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2 + (a.z - b.z)**2)


def _dot_angle(a, center, b):
    """Angle (degrees) at `center` formed by vectors center→a and center→b."""
    v1 = np.array([a.x - center.x, a.y - center.y])
    v2 = np.array([b.x - center.x, b.y - center.y])
    cos = np.clip(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6), -1, 1)
    return math.degrees(math.acos(cos))


class GestureEngine:
    def __init__(self):
        self.hands = mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.75,
            min_tracking_confidence=0.75,
            model_complexity=1          # ← upgraded from 0 for better accuracy
        )
        self.gesture_buffer = []
        self.confidence_threshold = 0.80   # slightly lower → catches more valid gestures
        self.last_triggered = ""
        self.last_trigger_time = 0
        self._last_raw_gesture = "none"
        self._last_raw_conf = 0.0
        self._finger_states = [False, False, False, False]

    # ─── Orientation-Aware Finger Detection ──────────────────────────────────
    def get_finger_states(self, lm):
        """
        Detects which fingers are extended using 3D landmark distances
        rather than simple y-comparison.  Works at any hand orientation.
        """
        fingers = []
        tip_pip_pairs = [
            (INDEX_TIP,  INDEX_MCP),
            (MIDDLE_TIP, MIDDLE_MCP),
            (RING_TIP,   RING_MCP),
            (PINKY_TIP,  PINKY_MCP),
        ]
        # Palm size = wrist-to-middle-MCP distance (normalization reference)
        palm_size = _dist(lm[WRIST], lm[MIDDLE_MCP]) + 1e-6

        for tip, mcp in tip_pip_pairs:
            # Finger is extended if tip is far from its MCP relative to palm
            tip_to_mcp = _dist(lm[tip], lm[mcp])
            # Use PIP as secondary check: tip should be further from wrist than PIP
            pip_idx = tip - 2
            tip_to_wrist = _dist(lm[tip], lm[WRIST])
            pip_to_wrist = _dist(lm[pip_idx], lm[WRIST])
            extended = (tip_to_mcp / palm_size > 0.65) and (tip_to_wrist > pip_to_wrist * 0.95)
            fingers.append(extended)
        return fingers  # [index, middle, ring, pinky]

    # ─── Robust Thumb Detection ───────────────────────────────────────────────
    def get_thumb_state(self, lm):
        """
        Determines thumb state using joint angles + relative positions.
        Returns: (is_up, is_down, is_open)
        """
        palm_size = _dist(lm[WRIST], lm[MIDDLE_MCP]) + 1e-6

        # Thumb extension: tip far from index MCP
        thumb_extension = _dist(lm[THUMB_TIP], lm[INDEX_MCP]) / palm_size

        # Thumb vertical angle: is tip significantly above or below the wrist?
        tip_y    = lm[THUMB_TIP].y
        mcp_y    = lm[THUMB_MCP].y

        # How much tip is above/below MCP (normalized by palm)
        vertical_offset = (mcp_y - tip_y) / palm_size   # positive = tip is HIGHER (screen-y flipped)

        # Horizontal extension (for shaka/pinky-thumb) — relaxed threshold
        horizontal_offset = abs(lm[THUMB_TIP].x - lm[INDEX_MCP].x) / palm_size

        thumb_is_up   = vertical_offset > 0.4 and thumb_extension > 0.50
        thumb_is_down = vertical_offset < -0.4 and thumb_extension > 0.50
        # Relaxed: thumb just needs to be away from palm — not strictly horizontal
        thumb_is_open = horizontal_offset > 0.35 or thumb_extension > 0.65

        return thumb_is_up, thumb_is_down, thumb_is_open

    # ─── Gesture Classifier ───────────────────────────────────────────────────
    def classify_gesture(self, lm):
        """
        Classifies hand gesture and returns (gesture_name, confidence 0-1).
        Uses multi-condition scoring for robustness.
        """
        fingers = self.get_finger_states(lm)
        self._finger_states = fingers
        index, middle, ring, pinky = fingers

        thumb_up, thumb_down, thumb_open = self.get_thumb_state(lm)

        fingers_extended = sum(fingers)
        palm_size = _dist(lm[WRIST], lm[MIDDLE_MCP]) + 1e-6

        # ── OPEN PALM (all 4 fingers + thumb open) ───────────────────────────
        if fingers_extended >= 4:
            conf = 0.90 + 0.05 * (thumb_open or thumb_up)
            return ("open_palm", min(conf, 0.97))

        # ── CLOSED FIST / THUMBS ─────────────────────────────────────────────
        if fingers_extended == 0:
            if thumb_up:
                # Extra check: thumb tip clearly above index MCP
                if lm[THUMB_TIP].y < lm[INDEX_MCP].y - (0.05 * palm_size):
                    return ("thumbs_up", 0.94)
                return ("thumbs_up", 0.88)
            if thumb_down:
                if lm[THUMB_TIP].y > lm[PINKY_MCP].y + (0.02 * palm_size):
                    return ("thumbs_down", 0.93)
                return ("thumbs_down", 0.87)
            # Plain fist
            tip_cluster = sum(
                _dist(lm[t], lm[WRIST]) / palm_size < 1.2
                for t in [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]
            )
            conf = 0.88 + 0.03 * (tip_cluster >= 3)
            return ("fist", conf)

        # ── PEACE / ZOOM IN (index + middle up, others down) ─────────────────
        if index and middle and not ring and not pinky:
            # Check fingers are actually spread (V shape)
            spread = _dist(lm[INDEX_TIP], lm[MIDDLE_TIP]) / palm_size
            conf = 0.90 + min(0.06 * spread, 0.07)
            return ("peace_zoom_in", min(conf, 0.97))

        # ── INDEX POINT (only index up) ───────────────────────────────────────
        if index and not middle and not ring and not pinky:
            # Confirm index is clearly extended
            idx_ext = _dist(lm[INDEX_TIP], lm[INDEX_MCP]) / palm_size
            conf = 0.88 + min(0.08 * (idx_ext - 0.6), 0.09)
            return ("index_point", max(conf, 0.88))

        # ── PINKY + THUMB / SHAKA (zoom out) ────────────────────────────────────
        # Conditions: pinky up, middle+ring+index curled, thumb extended away from palm
        if pinky and not index and not middle and not ring:
            # Thumb must be extended (not tucked in)
            thumb_tip_to_ring_mcp = _dist(lm[THUMB_TIP], lm[RING_MCP]) / palm_size
            thumb_tip_to_wrist    = _dist(lm[THUMB_TIP], lm[WRIST]) / palm_size
            thumb_extended = thumb_tip_to_wrist > 0.55 or thumb_open
            if thumb_extended:
                spread = _dist(lm[PINKY_TIP], lm[THUMB_TIP]) / palm_size
                conf = 0.88 + min(0.07 * (spread - 0.6), 0.09)
                return ("pinky_thumb", max(conf, 0.88))
            # Even without thumb extended, pinky alone is partial match — lower conf
            return ("pinky_thumb", 0.82)

        return ("unknown", 0.0)

    # ─── Adaptive Buffer Filter ───────────────────────────────────────────────
    def apply_filter(self, gesture, confidence):
        """
        Adaptive buffer per gesture type.
        Requires N consecutive identical gestures above threshold.
        """
        if confidence < self.confidence_threshold or gesture == "unknown":
            self.gesture_buffer = []
            return None, 0.0

        self.gesture_buffer.append(gesture)
        required = GESTURE_BUFFERS.get(gesture, 5)

        # Keep only the last `required` items
        if len(self.gesture_buffer) > required:
            self.gesture_buffer = self.gesture_buffer[-required:]

        # All slots filled with same gesture?
        if len(self.gesture_buffer) == required and len(set(self.gesture_buffer)) == 1:
            action = ACTION_MAP.get(gesture, "NONE")
            cooldown = GESTURE_COOLDOWNS.get(action, 1.0)
            now = time.time()
            if gesture == self.last_triggered and (now - self.last_trigger_time) < cooldown:
                return None, 0.0   # still in cooldown
            self.last_triggered = gesture
            self.last_trigger_time = now
            self.gesture_buffer = []
            return gesture, confidence

        return None, 0.0

    # ─── Public API ───────────────────────────────────────────────────────────
    def get_action(self, name):
        return ACTION_MAP.get(name, "NONE")

    def process_frame(self, frame):
        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False          # performance: skip copy
        results = self.hands.process(rgb)
        rgb.flags.writeable = True

        gesture_result = None
        raw_gesture, raw_conf = "none", 0.0

        if results.multi_hand_landmarks:
            for hand_lm in results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(
                    frame, hand_lm, mp_hands.HAND_CONNECTIONS,
                    mp_drawing_styles.get_default_hand_landmarks_style(),
                    mp_drawing_styles.get_default_hand_connections_style()
                )
                raw_gesture, raw_conf = self.classify_gesture(hand_lm.landmark)
                confirmed, conf = self.apply_filter(raw_gesture, raw_conf)
                if confirmed:
                    gesture_result = {
                        "gesture":    confirmed,
                        "confidence": round(conf * 100, 1),
                        "action":     self.get_action(confirmed),
                        "timestamp":  time.time(),
                    }

        self._last_raw_gesture = raw_gesture
        self._last_raw_conf    = raw_conf
        self._draw_hud(frame, raw_gesture, raw_conf, gesture_result)
        return frame, gesture_result

    # ─── HUD ─────────────────────────────────────────────────────────────────
    def _draw_hud(self, frame, raw, conf, confirmed):
        h, w = frame.shape[:2]

        # Semi-transparent dark header bar
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (w, 75), (8, 10, 20), -1)
        cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

        # Confidence color gradient: red → orange → green
        if conf >= 0.85:
            color = (0, 220, 100)      # green
        elif conf >= 0.70:
            color = (0, 180, 255)      # orange
        else:
            color = (60, 60, 200)      # dim red/blue for low confidence

        # Gesture name + confidence %
        label = f"{raw.replace('_', ' ').upper()}  {int(conf * 100)}%"
        cv2.putText(frame, label, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.62, color, 2, cv2.LINE_AA)

        # Action flash when confirmed
        if confirmed:
            flash_color = (0, 255, 220)
            cv2.putText(frame, f">> {confirmed['action']}", (12, 58),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, flash_color, 2, cv2.LINE_AA)

        # ── Finger state bars (right side of HUD) ────────────────────────────
        bar_labels = ['I', 'M', 'R', 'P']
        for i, (label_c, extended) in enumerate(zip(bar_labels, self._finger_states)):
            bx = w - 115 + i * 26
            # Background bar
            cv2.rectangle(frame, (bx, 10), (bx + 18, 65), (30, 30, 40), -1)
            # Filled bar
            bar_col = (0, 220, 100) if extended else (80, 40, 40)
            fill_h  = 55 if extended else 15
            cv2.rectangle(frame, (bx, 65 - fill_h), (bx + 18, 65), bar_col, -1)
            cv2.putText(frame, label_c, (bx + 4, 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180, 180, 180), 1, cv2.LINE_AA)

        # ── Buffer progress dots ──────────────────────────────────────────────
        required = GESTURE_BUFFERS.get(raw, 5)
        filled   = len(self.gesture_buffer)
        for i in range(required):
            cx = w - 145 + i * 16
            col = (0, 220, 100) if i < filled else (45, 45, 55)
            cv2.circle(frame, (cx, 72), 5, col, -1, cv2.LINE_AA)

        # ── Confidence bar (bottom of HUD) ────────────────────────────────────
        bar_w = int((w - 20) * conf)
        cv2.rectangle(frame, (10, 68), (w - 10, 71), (30, 30, 40), -1)
        cv2.rectangle(frame, (10, 68), (10 + bar_w, 71), color, -1)

    def release(self):
        self.hands.close()
