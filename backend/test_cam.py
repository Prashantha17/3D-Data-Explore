import cv2

print("Testing camera 1...")
cap = cv2.VideoCapture(1)
print("cap isOpened:", cap.isOpened())
if cap.isOpened():
    ret, frame = cap.read()
    print("ret:", ret, "frame size:", frame.shape if frame is not None else None)
cap.release()
print("Done")
