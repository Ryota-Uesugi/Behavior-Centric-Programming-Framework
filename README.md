# 🚁 Drone Behavior Analyzing Platform (DBAP)

[cite_start]DBAP is a behavior-centric programming framework for drone systems with digital twin backends[cite: 1, 2, 48]. [cite_start]This platform aims to provide a comfortable development environment for exploratory programming by allowing developers to focus on the mainstream behavior of physical systems while managing complex non-functional requirements[cite: 32, 51, 53]. 

## ✨ Key Research Features

[cite_start]This framework specifically addresses three major challenges in physical system development[cite: 69]:

* [cite_start]**Dynamic Multiple Views:** When you change a program, you can observe its behavior in multiple views simultaneously, and the behavior of each view changes in real-time[cite: 33, 70, 432].
* [cite_start]**Liveness and Conformity:** Developers can check whether the program matches their intended image before execution to confirm conformity[cite: 34, 71, 72, 434, 435]. [cite_start]The program then executes immediately without any bothersome actions to satisfy liveness[cite: 35, 73, 436].
* [cite_start]**Real Drone & Digital Twin Execution:** A single program can execute seamlessly on both a digital twin (such as Hakoniwa and Unity-based simulators) and the real world (such as ArduPilot)[cite: 36, 41, 74, 79, 437]. [cite_start]This is achieved using MAVLink, the communication protocol for unmanned systems[cite: 40, 78, 165].

---

## 🏗️ System Architecture

[cite_start]The DBAP framework consists of three main modules designed to ensure liveness and provide dynamic multiple views[cite: 90, 92].

| Core Module | Directory Mapping | Description |
| :--- | :--- | :--- |
| **DBAP Kernel** | `API/`, `Engine/` | [cite_start]A Python application running on a Ground Control Station (GCS) PC[cite: 97]. [cite_start]It applies user-defined analysis expressions to MAVLink telemetry to compute physical quantities and logical judgments[cite: 94]. |
| **Blocky Editor** | `Server/web/js/block/` | [cite_start]A domain-specific visual block programming language editor running in a web browser[cite: 37, 75, 101]. [cite_start]It assists users in defining analysis expressions for telemetry analysis[cite: 102]. |
| **3D Real-time Monitor** | `Server/web/js/monitor/` | [cite_start]A web-based user interface that visualizes the drone in 3D, lists telemetry data, and displays computed results simultaneously[cite: 98, 99]. |

---

## ⚙️ Kernel Internal Mechanisms

[cite_start]The DBAP Kernel serves as the central hub and is divided into three critical subsystems[cite: 170, 171]:

* [cite_start]**Data Capture (`mavlink/`):** Collects MAVLink telemetry from a real drone, a Software In The Loop (SITL) simulation, or pre-recorded logs[cite: 172, 181, 182, 183, 184]. [cite_start]It converts this data into a suitable format for streaming and analysis[cite: 172].
* [cite_start]**Check & Parse (`parser/`):** Translates visual block expressions into an internal tree-structured intermediate representation, known as an Abstract Syntax Tree (AST)[cite: 174, 176, 188, 194]. [cite_start]It enforces strict type definitions to ensure safe runtime execution[cite: 177, 375].
* [cite_start]**Runtime Calculate (`Engine/`):** Evaluates the ASTs using real-time telemetry collected by the Data Capture module[cite: 178]. [cite_start]It supports dynamic logic replacement (hot-swapping) without interrupting the system's operation, which is essential for liveness[cite: 199, 219].

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
