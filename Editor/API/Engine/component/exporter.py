import csv
import os
import datetime
import matplotlib
matplotlib.use('Agg') 
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from collections import deque
from logger import logger

# --- 設定 ---
LOG_DIR = "./logs"
GRAPH_HISTORY_LEN = 100  # 保持するデータ点数（兼グラフの横幅固定値）

# --- グローバル変数 ---
# キー=(filename, series_name), 値=deque( (value, color) )
_BUFFERS = {} 

def _ensure_dir(directory):
    if not os.path.exists(directory):
        os.makedirs(directory)

def write_csv_log(value, label, filename):
    """
    CSVログ出力
    """
    _ensure_dir(LOG_DIR)
    filepath = os.path.join(LOG_DIR, filename + ".csv")
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")
    
    try:
        file_exists = os.path.isfile(filepath)
        with open(filepath, mode='a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["Timestamp", "Label", "Value"])
            writer.writerow([now_str, label, value])
        return True
    except Exception as e:
        logger.error(f"Failed to write csv ({filename}): {e}")
        return False

def send_graph_data(value, series_name, filename, color):
    """
    データをバッファに追加し、指定されたファイル名でグラフ画像を保存します。
    データ点ごとに色を記録し、途中での色変更を反映します。
    """
    global _BUFFERS
    
    try:
        # 1. データの蓄積 (値と色をペアで保存)
        key = (filename, series_name)
        
        if key not in _BUFFERS:
            _BUFFERS[key] = deque(maxlen=GRAPH_HISTORY_LEN)
        
        # 値と色をセットで保存
        _BUFFERS[key].append((value, color))
        
        # 2. グラフ描画と保存
        _ensure_dir(LOG_DIR)
        save_path = os.path.join(LOG_DIR, filename + ".png")

        fig = None
        try:
            fig, ax = plt.subplots(figsize=(6, 4))
            plotted_something = False
            
            # --- 描画処理 ---
            for (f_name, s_name), data_deque in _BUFFERS.items():
                if f_name != filename:
                    continue

                # データをリスト化して分解
                data_list = list(data_deque)
                if len(data_list) < 2:
                    # 点が2つ未満の場合は点でプロット
                    y_vals = [d[0] for d in data_list]
                    c_vals = [d[1] for d in data_list]
                    x_vals = range(len(y_vals))
                    ax.scatter(x_vals, y_vals, c=c_vals, label=s_name)
                    plotted_something = True
                    continue

                # --- LineCollection用データの作成 ---
                y_vals = [d[0] for d in data_list]
                c_vals = [d[1] for d in data_list]
                x_vals = list(range(len(y_vals)))

                # 線分リスト作成: [(x0, y0), (x1, y1)], ...
                points = list(zip(x_vals, y_vals))
                segments = []
                segment_colors = []

                for i in range(len(points) - 1):
                    segments.append([points[i], points[i+1]])
                    segment_colors.append(c_vals[i]) # 始点の色を採用

                # マルチカラーの線を作成
                lc = LineCollection(segments, colors=segment_colors, linewidth=1.5, label=s_name)
                ax.add_collection(lc)
                
                # 凡例用のダミープロット
                ax.plot([], [], color=c_vals[-1], label=s_name)
                
                plotted_something = True

            if plotted_something:
                ax.set_title(f"Graph: {filename}")
                ax.set_xlabel("Time (points)")
                ax.set_ylabel(f"{series_name}")
                ax.grid(True)
                ax.legend(loc='upper right')
                
                # Y軸はデータに合わせてオートスケール
                ax.autoscale_view(scalex=False, scaley=True)
                
                # 【修正】X軸の範囲を 0 ～ GRAPH_HISTORY_LEN に固定
                ax.set_xlim(0, GRAPH_HISTORY_LEN)
                
                # Y軸のみ余白を持たせる
                ax.margins(x=0, y=0.1)

                plt.tight_layout()
                fig.savefig(save_path)

        finally:
            if fig:
                plt.close(fig)

        return True

    except Exception as e:
        logger.error(f"Graph export failed ({filename}): {e}")
        return False