import subprocess
import sys

def main():
    python = sys.executable

    p1 = subprocess.Popen([python, "./API/main.py"])
    p2 = subprocess.Popen([python, "./Server/Server.py"])

    p1.wait()
    p2.wait()

if __name__ == "__main__":
    main()
