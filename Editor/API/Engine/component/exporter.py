import csv
import os
import datetime
import matplotlib
matplotlib.use('Agg') 
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from collections import deque
from logger import logger

# --- Configuration ---
LOG_DIR = "./logs"
GRAPH_HISTORY_LEN = 100  # Number of data points to keep (also the fixed width of the graph)

# --- Global Variables ---
# Key=(filename, series_name), Value=deque( (value, color) )
_BUFFERS = {} 

def _ensure_dir(directory):
    if not os.path.exists(directory):
        os.makedirs(directory)

def write_csv_log(value, label, filename):
    """
    Output CSV log.
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
    Adds data to the buffer and saves the graph image with the specified filename.
    Records the color for each data point to reflect color changes during the process.
    """
    global _BUFFERS
    
    try:
        # 1. Accumulate data (save value and color as a pair)
        key = (filename, series_name)
        
        if key not in _BUFFERS:
            _BUFFERS[key] = deque(maxlen=GRAPH_HISTORY_LEN)
        
        # Save value and color as a set
        _BUFFERS[key].append((value, color))
        
        # 2. Plot and save graph
        _ensure_dir(LOG_DIR)
        save_path = os.path.join(LOG_DIR, filename + ".png")

        fig = None
        try:
            fig, ax = plt.subplots(figsize=(6, 4))
            plotted_something = False
            
            # --- Plotting Process ---
            for (f_name, s_name), data_deque in _BUFFERS.items():
                if f_name != filename:
                    continue

                # Convert data to list for processing
                data_list = list(data_deque)
                if len(data_list) < 2:
                    # Plot as points if there are fewer than 2 points
                    y_vals = [d[0] for d in data_list]
                    c_vals = [d[1] for d in data_list]
                    x_vals = range(len(y_vals))
                    ax.scatter(x_vals, y_vals, c=c_vals, label=s_name)
                    plotted_something = True
                    continue

                # --- Create data for LineCollection ---
                y_vals = [d[0] for d in data_list]
                c_vals = [d[1] for d in data_list]
                x_vals = list(range(len(y_vals)))

                # Create segment list: [(x0, y0), (x1, y1)], ...
                points = list(zip(x_vals, y_vals))
                segments = []
                segment_colors = []

                for i in range(len(points) - 1):
                    segments.append([points[i], points[i+1]])
                    segment_colors.append(c_vals[i]) # Use the color of the starting point

                # Create multicolor line
                lc = LineCollection(segments, colors=segment_colors, linewidth=1.5, label=s_name)
                ax.add_collection(lc)
                
                # Dummy plot for legend
                ax.plot([], [], color=c_vals[-1], label=s_name)
                
                plotted_something = True

            if plotted_something:
                ax.set_title(f"Graph: {filename}")
                ax.set_xlabel("Time (points)")
                ax.set_ylabel(f"{series_name}")
                ax.grid(True)
                ax.legend(loc='upper right')
                
                # Autoscale Y-axis based on data
                ax.autoscale_view(scalex=False, scaley=True)
                
                # [Fix] Fix X-axis range from 0 to GRAPH_HISTORY_LEN
                ax.set_xlim(0, GRAPH_HISTORY_LEN)
                
                # Add margins only to the Y-axis
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