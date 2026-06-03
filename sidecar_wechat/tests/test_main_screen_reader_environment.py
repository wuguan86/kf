import logging
import os
import sys
import unittest
from unittest.mock import MagicMock, patch


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core import main as main_module


class EmptyTreeWindow:
    def GetChildren(self):
        return []


class FakeUi:
    def __init__(self):
        self._cached_main = object()
        self._tree_logged_handle = object()

    def get_main_window(self):
        return EmptyTreeWindow()


class LoginUi:
    def _locate_session_list(self, window):
        return None

    def _locate_message_list(self, window):
        return None


class ChatUi:
    def _locate_session_list(self, window):
        return object()

    def _locate_message_list(self, window):
        return object()


class ScreenReaderEnvironmentTests(unittest.TestCase):
    def test_start_keeps_screen_reader_marker_process_alive_until_stop(self):
        logger = logging.getLogger("test_screen_reader_environment")
        process = MagicMock()
        process.poll.return_value = None

        with patch.object(main_module.os, "name", "nt"), \
            patch.object(main_module.sys, "executable", r"C:\Python\python.exe"), \
            patch("tempfile.gettempdir", return_value=r"C:\Temp"), \
            patch("ctypes.windll.user32.SystemParametersInfoW", return_value=True) as spi_mock, \
            patch("shutil.copy2") as copy_mock, \
            patch("subprocess.Popen", return_value=process) as popen_mock:
            env = main_module.ScreenReaderEnvironment(logger)

            env.start()
            env.stop()

        spi_mock.assert_called_once_with(0x0047, 1, None, 0x0001 | 0x0002)
        copy_mock.assert_called_once_with(r"C:\Python\python.exe", r"C:\Temp\nvda.exe")
        popen_mock.assert_called_once()
        self.assertEqual(popen_mock.call_args.args[0][0], r"C:\Temp\nvda.exe")
        self.assertIn("time.sleep", popen_mock.call_args.args[0][2])
        process.terminate.assert_called_once()

    def test_refresh_restarts_wechat_when_existing_window_has_empty_tree(self):
        logger = MagicMock()
        ui = FakeUi()

        with patch.object(main_module, "_find_running_wechat_executable_path", return_value=r"E:\Program Files\Tencent\Weixin\Weixin.exe", create=True), \
            patch.object(main_module, "_stop_wechat_processes", create=True) as stop_mock, \
            patch.object(main_module.subprocess, "Popen") as popen_mock, \
            patch.object(main_module.time, "sleep") as sleep_mock:
            refreshed = main_module.refresh_wechat_accessibility_if_needed(ui, logger)

        self.assertTrue(refreshed)
        stop_mock.assert_called_once()
        popen_mock.assert_called_once()
        self.assertEqual(popen_mock.call_args.args[0], [r"E:\Program Files\Tencent\Weixin\Weixin.exe"])
        launch_env = popen_mock.call_args.kwargs["env"]
        self.assertEqual(launch_env["QT_ANGLE_PLATFORM"], "software")
        self.assertEqual(launch_env["QT_OPENGL"], "software")
        self.assertEqual(launch_env["QT_QUICK_BACKEND"], "software")
        self.assertEqual(launch_env["QSG_RHI_PREFER_SOFTWARE_RENDERER"], "1")
        self.assertIn("--disable-gpu", launch_env["QTWEBENGINE_CHROMIUM_FLAGS"])
        sleep_mock.assert_called_once_with(8)
        self.assertIsNone(ui._cached_main)
        self.assertIsNone(ui._tree_logged_handle)

    def test_ready_check_rejects_login_window_without_chat_lists(self):
        self.assertFalse(main_module.is_wechat_main_interface_ready(LoginUi(), object()))

    def test_ready_check_accepts_window_with_session_and_message_lists(self):
        self.assertTrue(main_module.is_wechat_main_interface_ready(ChatUi(), object()))


if __name__ == "__main__":
    unittest.main()
