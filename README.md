# 🚁 DBAP (Drone Behavior Analyzing Platform)

[cite_start]DBAPは、デジタルツインバックエンドを備えたドローンシステム向けの振る舞い中心プログラミングフレームワークです [cite: 1, 2, 37]。
[cite_start]開発者が天候や通信などの非機能要件に煩わされることなく、ドローンのコアな振る舞いの開発に集中できる環境を提供します [cite: 51, 52]。

## ✨ 主な機能 (Key Features)

* [cite_start]**動的なマルチビュー (Dynamic Multiple Views)**: プログラムを変更すると、複数のビュー（3Dモニター、グラフ、テレメトリリスト）で同時にシステムの振る舞いの変化を観察できます [cite: 33, 99]。
* [cite_start]**ライブ性と適合性 (Liveness and Conformity)**: 実行前にプログラムが意図した通りかを確認でき、煩わしい操作なしに即座にシステムへ反映されます [cite: 34, 35]。
* [cite_start]**実機とシミュレータのシームレスな統合**: MAVLinkプロトコルを採用しており、1つのプログラムを実機のドローン（ArduPilot）でも、デジタルツイン（Hakoniwa/Unity）でもそのまま実行可能です [cite: 36, 40, 41]。

---

## 🏗️ システムアーキテクチャ (System Architecture)

[cite_start]本プラットフォームは大きく3つのモジュールで構成されており、バックエンドのPythonシステムとフロントエンドのWebアプリケーションが連携して動作します [cite: 92]。

| モジュール名 | 該当ディレクトリ | 役割と概要 |
| :--- | :--- | :--- |
| **DBAP Kernel** | `API/`, `Engine/` | [cite_start]ユーザー定義の解析式を評価し、テレメトリのリアルタイム処理と論理判定を行うコアシステムです [cite: 93, 94, 95]。 |
| **Data Capture** | `mavlink/` | [cite_start]実機、SITLシミュレーション、またはログからMAVLinkテレメトリを収集しストリーム化します [cite: 181, 182, 183, 184]。 |
| **Check & Parse** | `parser/` | [cite_start]エディタから送信された式を解析・型チェックし、抽象構文木 (AST) に変換します [cite: 188]。 |
| **通信 & サーバー** | `Server/`, `ws/` | [cite_start]REST APIによる式の受信と、WebSocketを介した3Dモニターへのデータ配信を行います [cite: 133, 135, 209]。 |
| **Blocky Editor** | `Server/web/js/block/` | [cite_start]ブラウザ上で動作するドメイン固有の視覚的ブロックプログラミングエディタです [cite: 37, 101]。 |
| **3D Real-time Monitor**| `Server/web/js/monitor/`| [cite_start]3D空間でのドローンの挙動やテレメトリデータ、計算結果をリアルタイムに視覚化します [cite: 98, 99, 100]。 |

---

## 📁 フォルダ構成 (Directory Structure)

```text
📦 DBAP-Project
 ┣ 📜 launch.py                 # アプリケーションのエントリポイント
 ┣ 📂 API                       # システム全体の設定とREST APIエンドポイント
 ┃ ┣ 📜 config.py
 ┃ ┣ 📜 main.py
 ┃ ┗ 📂 api                     # 式のパースや設定保存のAPIロジック
 ┣ 📂 Engine                    # 実行エンジン (Runtime Calculate)
 ┃ ┣ 📜 EvalKernel.py           # 抽象構文木(AST)のリアルタイム評価
 ┃ ┣ 📜 expr_eval.py
 ┃ ┗ 📂 component               # コントローラーや外部出力(エクスポート)機能
 ┣ 📂 mavlink                   # データキャプチャモジュール
 ┃ ┣ 📜 connection.py           # ターゲット(実機/SITL)とのMAVLink接続
 ┃ ┗ 📜 listener.py
 ┣ 📂 parser                    # Check & Parse モジュール
 ┃ ┣ 📜 definitions.py
 ┃ ┣ 📜 definition_parser.py    # 構文チェックとASTへの変換処理
 ┃ ┗ 📜 expr_parser.py
 ┣ 📂 ws                        # WebSocket 通信モジュール
 ┃ ┣ 📜 broadcast.py            # 3Dモニターへのテレメトリ配信
 ┃ ┗ 📜 handler.py
 ┣ 📂 Server                    # Webサーバーモジュール
 ┃ ┣ 📜 Server.py               # フロントエンドのホスティング
 ┃ ┗ 📂 web                     # フロントエンドの静的ファイル
 ┃   ┣ 📜 index.html
 ┃   ┣ 📜 block.html            # Blocky Editor UI
 ┃   ┣ 📂 css
 ┃   ┗ 📂 js
 ┃     ┣ 📂 block               # ブロックUI、パース、ドラッグ＆ドロップ機能
 ┃     ┗ 📂 monitor             # Three.jsを用いた3Dビジュアライザ
 ┣ 📂 logs                      # 実行ログや出力グラフデータ (CSV/PNG)
 ┣ 📂 logs_ws                   # WebSocket通信のログ
 ┗ 📂 settings                  # システム定義や設定ファイル (JSON)
