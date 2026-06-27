import os, sys, subprocess, shutil, glob, json
from pathlib import Path
from abc import ABC, abstractmethod
from typing import Optional, List


class PlatformAdapter(ABC):
    @abstractmethod
    def open_app(self, app_path: str) -> None:
        pass

    @abstractmethod
    def pick_files(self, prompt: str, extensions: list) -> List[str]:
        pass

    @abstractmethod
    def open_folder(self, path: str) -> None:
        pass

    @abstractmethod
    def execute_jsx(self, script_path: str, app_name: str) -> str:
        pass

    @abstractmethod
    def find_indesign_startup_dir(self) -> Optional[str]:
        pass

    @abstractmethod
    def get_disk_space(self, path: str) -> int:
        pass

    @abstractmethod
    def find_indesign_app(self) -> Optional[str]:
        pass


class MacOSAdapter(PlatformAdapter):
    def open_app(self, app_path: str) -> None:
        subprocess.run(["open", app_path], capture_output=True)

    def pick_files(self, prompt: str, extensions: list) -> List[str]:
        ext_items = ", ".join(f'"{e}"' for e in extensions)
        script = (
            f'set selectedFiles to choose file with prompt "{prompt}" '
            f'with multiple selections allowed of type {{{ext_items}}}\n'
            'set outText to ""\n'
            "repeat with f in selectedFiles\n"
            "set outText to outText & POSIX path of f & linefeed\n"
            "end repeat\n"
            "return outText\n"
        )
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            if "-128" in result.stderr:
                return []
            raise RuntimeError(f"osascript failed: {result.stderr}")
        paths = [p.strip() for p in result.stdout.strip().split("\n") if p.strip()]
        return [p for p in paths if os.path.isfile(p)]

    def open_folder(self, path: str) -> None:
        subprocess.run(["open", path], capture_output=True)

    def execute_jsx(self, script_path: str, app_name: str) -> str:
        cmd = [
            "osascript",
            "-e", f'set f to POSIX file "{script_path}"',
            "-e", f'tell application "{app_name}"',
            "-e", "do script f language javascript",
            "-e", "end tell"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.stdout.strip() or result.stderr.strip()

    def find_indesign_startup_dir(self) -> Optional[str]:
        home = os.path.expanduser("~")
        root = Path(home) / "Library/Preferences/Adobe InDesign"
        if not root.exists():
            return None
        for version_dir in root.iterdir():
            if not version_dir.is_dir():
                continue
            for lang_dir in version_dir.iterdir():
                candidate = lang_dir / "Scripts" / "Startup Scripts"
                if candidate.exists():
                    return str(candidate)
        return None

    def get_disk_space(self, path: str) -> int:
        usage = shutil.disk_usage(path)
        return usage.free

    def find_indesign_app(self) -> Optional[str]:
        matches = glob.glob("/Applications/Adobe InDesign*/Adobe InDesign*.app")
        return matches[0] if matches else None


class WindowsAdapter(PlatformAdapter):
    def open_app(self, app_path: str) -> None:
        subprocess.run(["start", "", app_path], shell=True, capture_output=True)

    def pick_files(self, prompt: str, extensions: list) -> List[str]:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        paths = filedialog.askopenfilenames(title=prompt)
        root.destroy()
        return list(paths)

    def open_folder(self, path: str) -> None:
        subprocess.run(["explorer", path], shell=False, capture_output=True)

    def execute_jsx(self, script_path: str, app_name: str) -> str:
        import win32com.client
        try:
            app = win32com.client.Dispatch("InDesign.Application")
            app.DoScript(script_path, 1246973031)
            return "JSX executed successfully"
        except Exception as e:
            return f"JSX execution failed: {e}"

    def find_indesign_startup_dir(self) -> Optional[str]:
        appdata = os.environ.get("APPDATA")
        if not appdata:
            return None
        root = Path(appdata) / "Adobe" / "InDesign"
        if not root.exists():
            return None
        for version_dir in root.iterdir():
            if not version_dir.is_dir():
                continue
            for lang_dir in version_dir.iterdir():
                candidate = lang_dir / "Scripts" / "Startup Scripts"
                if candidate.exists():
                    return str(candidate)
        return None

    def get_disk_space(self, path: str) -> int:
        usage = shutil.disk_usage(path)
        return usage.free

    def find_indesign_app(self) -> Optional[str]:
        matches = glob.glob("C:\\Program Files\\Adobe\\Adobe InDesign*\\InDesign.exe")
        return matches[0] if matches else None


def create_adapter() -> PlatformAdapter:
    if sys.platform == "darwin":
        return MacOSAdapter()
    elif sys.platform == "win32":
        return WindowsAdapter()
    else:
        raise RuntimeError(f"Unsupported platform: {sys.platform}")
