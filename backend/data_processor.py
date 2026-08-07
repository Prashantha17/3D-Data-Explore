"""CSV Processing with Pandas — Vectorized for performance + Deep Analysis"""
import pandas as pd, numpy as np, os, uuid

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return isinstance(filename, str) and filename.lower().endswith('.csv')

def save_file(file_obj, original_name):
    name = f"{uuid.uuid4().hex}.csv"
    path = os.path.join(UPLOAD_FOLDER, name)
    file_obj.save(path)
    return name, path

def clean_and_parse_columns(df):
    """
    Attempt to clean and convert string/object columns to numeric if they are numeric-like.
    This handles things like currency symbols ($), commas (1,000), percentage signs (%),
    or surrounding spaces, so they can be properly processed as numbers and visualized in 3D.
    """
    for col in df.columns:
        if df[col].dtype == object:
            # Check if this column is mostly numeric-like
            # Drop NaN values first to test non-null entries
            non_null_series = df[col].dropna()
            if len(non_null_series) == 0:
                continue
            
            # Convert to string and clean common numeric formatting characters
            cleaned = non_null_series.astype(str).str.strip()
            # Remove leading/trailing formatting characters
            cleaned = cleaned.str.replace(r'^\$', '', regex=True)
            cleaned = cleaned.str.replace(r'%$', '', regex=True)
            cleaned = cleaned.str.replace(r',', '', regex=True)
            
            # Try to convert to float
            converted = pd.to_numeric(cleaned, errors='coerce')
            
            # If at least 80% of the non-null values successfully convert to numeric,
            # we apply this conversion to the whole column in the original dataframe.
            num_valid = converted.notna().sum()
            if num_valid / len(non_null_series) >= 0.8:
                # Do the conversion for the original column
                df[col] = df[col].astype(str).str.strip()
                df[col] = df[col].str.replace(r'^\$', '', regex=True)
                df[col] = df[col].str.replace(r'%$', '', regex=True)
                df[col] = df[col].str.replace(r',', '', regex=True)
                df[col] = pd.to_numeric(df[col], errors='coerce')
    return df

def _normalize_series(series, mn, mx):
    """Normalize a pandas Series to [-5, 5] range."""
    if mx == mn:
        return pd.Series([0.0] * len(series), index=series.index)
    return ((series - mn) / (mx - mn) * 10 - 5).round(4)


def compute_deep_analysis(df, num_cols, cat_cols):
    """
    Perform deep data analysis that reads ACTUAL data content:
    - Correlations between numeric columns
    - Top/bottom rows per column (who has the highest/lowest values)
    - Category frequency breakdown (how many items per category)
    - Outlier detection (Z-score > 2.5)
    - Trend direction (is data generally increasing/decreasing?)
    - Value distribution shape (skewness)
    - Missing data report
    """
    analysis = {}

    # ── 1. Correlations between numeric columns ──────────────────────────────
    if len(num_cols) >= 2:
        try:
            corr_matrix = df[num_cols].corr()
            strong_correlations = []
            for i in range(len(num_cols)):
                for j in range(i + 1, len(num_cols)):
                    r = round(float(corr_matrix.iloc[i, j]), 3)
                    if abs(r) > 0.5:  # Only report meaningful correlations
                        direction = "strong positive" if r > 0.7 else "moderate positive" if r > 0.5 else "strong negative" if r < -0.7 else "moderate negative"
                        strong_correlations.append({
                            "col_a": num_cols[i],
                            "col_b": num_cols[j],
                            "r": r,
                            "direction": direction,
                        })
            # Sort by absolute correlation strength
            strong_correlations.sort(key=lambda x: abs(x['r']), reverse=True)
            analysis['correlations'] = strong_correlations[:8]
        except Exception:
            analysis['correlations'] = []
    else:
        analysis['correlations'] = []

    # ── 2. Top / Bottom entries per column (actual data values) ───────────────
    top_bottom = {}
    for col in num_cols[:6]:  # Limit to 6 columns
        try:
            col_data = df[col].dropna()
            if len(col_data) == 0:
                continue
            # Find the actual rows with highest and lowest values
            idx_max = col_data.idxmax()
            idx_min = col_data.idxmin()
            top_row = df.iloc[idx_max].to_dict()
            bottom_row = df.iloc[idx_min].to_dict()
            # Convert values to JSON-safe types
            top_entry = {k: (None if pd.isna(v) else round(float(v), 3) if isinstance(v, (int, float, np.integer, np.floating)) else str(v)) for k, v in top_row.items()}
            bottom_entry = {k: (None if pd.isna(v) else round(float(v), 3) if isinstance(v, (int, float, np.integer, np.floating)) else str(v)) for k, v in bottom_row.items()}
            top_bottom[col] = {
                "highest": {"value": round(float(col_data.max()), 3), "row": top_entry},
                "lowest": {"value": round(float(col_data.min()), 3), "row": bottom_entry},
                "median": round(float(col_data.median()), 3),
            }
        except Exception:
            continue
    analysis['top_bottom'] = top_bottom

    # ── 3. Category frequency breakdown ──────────────────────────────────────
    category_breakdown = {}
    for col in cat_cols[:4]:  # Limit to 4 categorical columns
        try:
            counts = df[col].value_counts().head(10)
            total = len(df[col].dropna())
            category_breakdown[col] = {
                "top_values": [
                    {"value": str(idx), "count": int(cnt), "percent": round(cnt / total * 100, 1)}
                    for idx, cnt in counts.items()
                ],
                "unique_count": int(df[col].nunique()),
                "total_non_null": total,
            }
        except Exception:
            continue
    analysis['category_breakdown'] = category_breakdown

    # ── 4. Outlier detection (Z-score > 2.5) ─────────────────────────────────
    outliers = {}
    for col in num_cols[:6]:
        try:
            col_data = df[col].dropna()
            if len(col_data) < 10:
                continue
            mean = col_data.mean()
            std = col_data.std()
            if std == 0:
                continue
            z_scores = ((col_data - mean) / std).abs()
            outlier_count = int((z_scores > 2.5).sum())
            if outlier_count > 0:
                outlier_values = col_data[z_scores > 2.5].head(5).tolist()
                outliers[col] = {
                    "count": outlier_count,
                    "percent": round(outlier_count / len(col_data) * 100, 1),
                    "example_values": [round(float(v), 3) for v in outlier_values],
                }
        except Exception:
            continue
    analysis['outliers'] = outliers

    # ── 5. Distribution shape (skewness) ─────────────────────────────────────
    distribution = {}
    for col in num_cols[:6]:
        try:
            col_data = df[col].dropna()
            if len(col_data) < 5:
                continue
            skew_val = col_data.skew()
            if pd.isna(skew_val):
                continue
            skew = float(skew_val)
            if abs(skew) > 1:
                shape = "heavily right-skewed" if skew > 1 else "heavily left-skewed"
            elif abs(skew) > 0.5:
                shape = "moderately right-skewed" if skew > 0 else "moderately left-skewed"
            else:
                shape = "approximately symmetric"
            distribution[col] = {"skewness": round(skew, 3), "shape": shape}
        except Exception:
            continue
    analysis['distribution'] = distribution

    # ── 6. Category-wise averages (group by category, average numerics) ──────
    group_analysis = {}
    if cat_cols and num_cols:
        primary_cat = cat_cols[0]
        try:
            groups = df.groupby(primary_cat)[num_cols[:4]].mean()
            if len(groups) <= 15:
                group_analysis[primary_cat] = {}
                for idx, row in groups.iterrows():
                    group_analysis[primary_cat][str(idx)] = {
                        col: round(float(row[col]), 3) for col in row.index
                        if not pd.isna(row[col])
                    }
        except Exception:
            pass
    analysis['group_averages'] = group_analysis

    # ── 7. Missing data report ───────────────────────────────────────────────
    missing = {}
    for col in df.columns:
        null_count = int(df[col].isna().sum())
        if null_count > 0:
            missing[col] = {"count": null_count, "percent": round(null_count / len(df) * 100, 1)}
    analysis['missing_data'] = missing

    # ── 8. More preview rows (10 rows, spaced throughout the dataset) ────────
    if len(df) <= 10:
        sample_rows = df.fillna("").to_dict(orient="records")
    else:
        indices = np.linspace(0, len(df) - 1, 10, dtype=int)
        sample_rows = df.iloc[indices].fillna("").to_dict(orient="records")
    # Convert numpy types to JSON-safe
    for row in sample_rows:
        for k, v in row.items():
            if isinstance(v, (np.integer,)):
                row[k] = int(v)
            elif isinstance(v, (np.floating,)):
                row[k] = round(float(v), 3)
    analysis['sample_rows'] = sample_rows

    return analysis


def process_csv(file_path):
    try:
        df = pd.read_csv(file_path, nrows=100000)
        df = clean_and_parse_columns(df)
        # Drop columns/rows that are entirely NaN
        df = df.dropna(how='all', axis=1).dropna(how='all').reset_index(drop=True)
    except Exception as e:
        return {"error": f"Cannot read CSV: {str(e)}"}

    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()

    if len(num_cols) < 2:
        return {"error": "Need at least 2 numeric columns to visualize in 3D"}

    x_col = num_cols[0]
    y_col = num_cols[1]
    z_col = num_cols[2] if len(num_cols) > 2 else num_cols[0]
    color_col = cat_cols[0] if cat_cols else None

    # Fill NaN in numeric columns with column mean
    for c in [x_col, y_col, z_col]:
        df[c] = pd.to_numeric(df[c], errors='coerce').fillna(df[c].mean() if not df[c].isna().all() else 0)

    xmn, xmx = float(df[x_col].min()), float(df[x_col].max())
    ymn, ymx = float(df[y_col].min()), float(df[y_col].max())
    zmn, zmx = float(df[z_col].min()), float(df[z_col].max())

    # Backend visual downsampling for smooth performance with large datasets
    MAX_VIZ_POINTS = 3000
    if len(df) > MAX_VIZ_POINTS:
        step = len(df) // MAX_VIZ_POINTS
        df_viz = df.iloc[::step].head(MAX_VIZ_POINTS).copy()
    else:
        df_viz = df.copy()

    # Vectorized normalization — much faster than iterrows()
    x_norm = _normalize_series(df_viz[x_col], xmn, xmx)
    y_norm = _normalize_series(df_viz[y_col], ymn, ymx)
    z_norm = _normalize_series(df_viz[z_col], zmn, zmx)

    labels = df_viz[color_col].astype(str) if color_col else pd.Series([''] * len(df_viz))

    # Build tooltip dicts (still needs per-row, but limited to downsampled rows)
    tooltip_cols = df_viz.columns.tolist()
    tooltips = df_viz[tooltip_cols].astype(str).to_dict(orient='records')

    points = [
        {
            "x": float(x_norm.iloc[i]),
            "y": float(y_norm.iloc[i]),
            "z": float(z_norm.iloc[i]),
            "raw_x": float(df_viz[x_col].iloc[i]),
            "raw_y": float(df_viz[y_col].iloc[i]),
            "raw_z": float(df_viz[z_col].iloc[i]),
            "label": labels.iloc[i],
            "tooltip": tooltips[i],
        }
        for i in range(len(df_viz))
    ]

    def clean_val(v):
        return None if pd.isna(v) else round(float(v), 3)

    stats = {
        c: {
            "min": clean_val(df[c].min()),
            "max": clean_val(df[c].max()),
            "mean": clean_val(df[c].mean()),
            "std": clean_val(df[c].std() if len(df[c].dropna()) > 1 else 0),
        }
        for c in num_cols
    }

    if color_col:
        unique_labels = sorted(set(df[color_col].dropna().astype(str).unique()))
        unique_labels = [l for l in unique_labels if l != 'nan' and l != '']
    else:
        unique_labels = []

    # ── Deep analysis — actual data content ──────────────────────────────────
    deep_analysis = compute_deep_analysis(df, num_cols, cat_cols)

    return {
        "success": True,
        "row_count": len(df),
        "col_count": len(df.columns),
        "columns": df.columns.tolist(),
        "numeric_columns": num_cols,
        "categorical_columns": cat_cols,
        "default_axes": {"x": x_col, "y": y_col, "z": z_col},
        "color_column": color_col,
        "unique_labels": unique_labels,
        "chart_data": points,
        "axis_ranges": {
            "x": {"min": xmn, "max": xmx, "label": x_col},
            "y": {"min": ymn, "max": ymx, "label": y_col},
            "z": {"min": zmn, "max": zmx, "label": z_col},
        },
        "stats": stats,
        "preview": df.head(5).fillna("").to_dict(orient="records"),
        "deep_analysis": deep_analysis,
    }


def reprocess_with_axes(file_path, x_col, y_col, z_col):
    try:
        df = pd.read_csv(file_path, nrows=100000)
        df = clean_and_parse_columns(df)
    except Exception as e:
        return {"error": f"Cannot read file: {str(e)}"}

    for c in [x_col, y_col, z_col]:
        if c not in df.columns:
            return {"error": f"Column '{c}' not found in dataset"}
        df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0)

    xmn, xmx = float(df[x_col].min()), float(df[x_col].max())
    ymn, ymx = float(df[y_col].min()), float(df[y_col].max())
    zmn, zmx = float(df[z_col].min()), float(df[z_col].max())

    MAX_VIZ_POINTS = 3000
    if len(df) > MAX_VIZ_POINTS:
        step = len(df) // MAX_VIZ_POINTS
        df_viz = df.iloc[::step].head(MAX_VIZ_POINTS).copy()
    else:
        df_viz = df.copy()

    x_norm = _normalize_series(df_viz[x_col], xmn, xmx)
    y_norm = _normalize_series(df_viz[y_col], ymn, ymx)
    z_norm = _normalize_series(df_viz[z_col], zmn, zmx)

    tooltips = df_viz.astype(str).to_dict(orient='records')

    points = [
        {
            "x": float(x_norm.iloc[i]),
            "y": float(y_norm.iloc[i]),
            "z": float(z_norm.iloc[i]),
            "raw_x": float(df_viz[x_col].iloc[i]),
            "raw_y": float(df_viz[y_col].iloc[i]),
            "raw_z": float(df_viz[z_col].iloc[i]),
            "tooltip": tooltips[i],
        }
        for i in range(len(df_viz))
    ]

    return {
        "success": True,
        "chart_data": points,
        "axis_ranges": {
            "x": {"min": xmn, "max": xmx, "label": x_col},
            "y": {"min": ymn, "max": ymx, "label": y_col},
            "z": {"min": zmn, "max": zmx, "label": z_col},
        },
    }
