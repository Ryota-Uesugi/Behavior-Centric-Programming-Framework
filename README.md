# 🚁 Drone Behavior Analyzing Platform (DBAP)

DBAP is a behavior-centric programming framework for drone systems with digital twin backends. This platform aims to provide a comfortable development environment for exploratory programming by allowing developers to focus on the mainstream behavior of physical systems while managing complex non-functional requirements. 

## ✨ Key Research Features

This framework specifically addresses three major challenges in physical system development:

* **Dynamic Multiple Views:** When you change a program, you can observe its behavior in multiple views simultaneously, and the behavior of each view changes in real-time.
* **Liveness and Conformity:** Developers can check whether the program matches their intended image before execution to confirm conformity. The program then executes immediately without any bothersome actions to satisfy liveness.
* **Real Drone & Digital Twin Execution:** A single program can execute seamlessly on both a digital twin (such as Hakoniwa and Unity-based simulators) and the real world (such as ArduPilot). This is achieved using MAVLink, the communication protocol for unmanned systems.

---

## 🏗️ System Architecture

The DBAP framework consists of three main modules designed to ensure liveness and provide dynamic multiple views.

| Core Module | Directory Mapping | Description |
| :--- | :--- | :--- |
| **DBAP Kernel** | `API/`, `Engine/` | A Python application running on a Ground Control Station (GCS) PC. It applies user-defined analysis expressions to MAVLink telemetry to compute physical quantities and logical judgments. |
| **Blocky Editor** | `Server/web/js/block/` | A domain-specific visual block programming language editor running in a web browser. It assists users in defining analysis expressions for telemetry analysis. |
| **3D Real-time Monitor** | `Server/web/js/monitor/` | A web-based user interface that visualizes the drone in 3D, lists telemetry data, and displays computed results simultaneously. |

---

## ⚙️ Kernel Internal Mechanisms

The DBAP Kernel serves as the central hub and is divided into three critical subsystems:

* **Data Capture (`mavlink/`):** Collects MAVLink telemetry from a real drone, a Software In The Loop (SITL) simulation, or pre-recorded logs. It converts this data into a suitable format for streaming and analysis.
* **Check & Parse (`parser/`):** Translates visual block expressions into an internal tree-structured intermediate representation, known as an Abstract Syntax Tree (AST). It enforces strict type definitions to ensure safe runtime execution.
* **Runtime Calculate (`Engine/`):** Evaluates the ASTs using real-time telemetry collected by the Data Capture module. It supports dynamic logic replacement (hot-swapping) without interrupting the system's operation, which is essential for liveness.

---

## 📁 Repository Directory Structure

```text
📦 DBAP-Project
 ┣ 📜 launch.py                 # Application entry point
 ┣ 📂 API                       # System configuration and REST API endpoints
 ┃ ┣ 📜 config.py
 ┃ ┣ 📜 main.py
 ┃ ┗ 📂 api                     # Logic for expression parsing and settings storage
 ┣ 📂 Engine                    # Runtime Calculate component
 ┃ ┣ 📜 EvalKernel.py           # Core AST evaluator and control loop manager
 ┃ ┣ 📜 expr_eval.py            # Expression execution logic
 ┃ ┗ 📂 component               # Sub-components for functions and output
 ┃   ┣ 📜 drone_controller.py   # Issues MAVLink commands to the target
 ┃   ┣ 📜 exporter.py           # Handles external outputs (Graphs, CSVs)
 ┃   ┗ 📜 func_handlers.py      # Pre-defined function executions
 ┣ 📂 mavlink                   # Data Capture component
 ┃ ┣ 📜 connection.py           # Establishes MAVLink protocol communication
 ┃ ┣ 📜 listener.py             # Receives and filters high-frequency telemetry
 ┃ ┗ 📜 replay.py               # Replays telemetry from stored logs
 ┣ 📂 parser                    # Check & Parse component
 ┃ ┣ 📜 definitions.py          # Type and function definitions
 ┃ ┣ 📜 definition_parser.py    # Validates input against definitions
 ┃ ┣ 📜 expr_analysis.py        # Semantic annotation logic
 ┃ ┗ 📜 expr_parser.py          # AST conversion logic
 ┣ 📂 ws                        # WebSocket communication layer
 ┃ ┣ 📜 broadcast.py            # Streams synchronized state data to external monitors
 ┃ ┗ 📜 handler.py
 ┣ 📂 Server                    # Web Server module
 ┃ ┣ 📜 Server.py               # Hosts the front-end interfaces
 ┃ ┗ 📂 web                     # Static web assets
 ┃   ┣ 📜 index.html            # Main entry page
 ┃   ┣ 📜 block.html            # The Blocky Editor Workspace
 ┃   ┣ 📂 css                   # Styling and layout
 ┃   ┗ 📂 js                    # Client-side application logic
 ┃     ┣ 📂 block               # Block creation, dragging, dropping, and parsing logic
 ┃     ┗ 📂 monitor             # Three.js visualizer for 3D drone rendering
 ┣ 📂 logs                      # Directory for exported analytical results (CSV/PNG)
 ┣ 📂 logs_ws                   # Websocket telemetry logs
 ┗ 📂 settings                  # System rule configurations (JSON format)
