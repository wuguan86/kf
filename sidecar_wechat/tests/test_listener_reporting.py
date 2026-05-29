import logging
import os
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core.config import BridgeConfig
from core.listener import Listener


class FakeUI:
    def _normalize_contact_name(self, name):
        return name

    def extract_latest_messages(self, contact):
        return [
            {
                "contact": contact,
                "type": "text",
                "content": "历史对方消息",
                "is_self": False,
                "ui_id": "other-1",
            },
            {
                "contact": contact,
                "type": "text",
                "content": "我的消息",
                "is_self": True,
                "ui_id": "self-1",
            },
            {
                "contact": contact,
                "type": "text",
                "content": "最新对方消息",
                "is_self": False,
                "trigger_reply": True,
                "ui_id": "other-2",
            },
        ]


class FakePoller:
    def __init__(self):
        self.messages = []

    def enqueue(self, payload):
        self.messages.append(payload)


class BusyCommandUI(FakeUI):
    def __init__(self):
        self.extract_calls = 0
        self.unread_calls = 0

    def is_user_command_active(self):
        return True

    def get_main_window(self):
        return object()

    def get_current_chat_title(self, window):
        return "夏天"

    def extract_latest_messages(self, contact):
        self.extract_calls += 1
        return super().extract_latest_messages(contact)

    def find_unread_sessions(self):
        self.unread_calls += 1
        return []


class SequenceUI:
    def __init__(self, batches):
        self._batches = list(batches)
        self._index = 0

    def _normalize_contact_name(self, name):
        return name

    def extract_latest_messages(self, contact):
        batch = self._batches[min(self._index, len(self._batches) - 1)]
        self._index += 1
        return [
            {
                **message,
                "contact": contact,
                "type": message.get("type", "text"),
            }
            for message in batch
        ]


class ListenerReportingTests(unittest.TestCase):
    def test_listener_skips_scan_while_user_command_is_active(self):
        ui = BusyCommandUI()
        poller = FakePoller()
        listener = Listener(BridgeConfig(), ui, logging.getLogger("test_listener_reporting"), poller)

        listener.process_cycle()

        self.assertEqual(ui.extract_calls, 0)
        self.assertEqual(ui.unread_calls, 0)
        self.assertEqual(poller.messages, [])

    def test_first_scan_suppresses_visible_self_history(self):
        poller = FakePoller()
        listener = Listener(BridgeConfig(), FakeUI(), logging.getLogger("test_listener_reporting"), poller)

        listener._fetch_and_report("夏天")

        self.assertEqual([msg["content"] for msg in poller.messages], ["最新对方消息"])
        self.assertFalse(poller.messages[0]["is_self"])
        self.assertTrue(poller.messages[0]["trigger_reply"])

    def test_self_messages_after_baseline_are_reported_for_display_without_triggering_ai(self):
        baseline = [
            {"content": "上一轮客户消息", "is_self": False, "trigger_reply": True, "ui_id": "old-other"},
        ]
        next_batch = [
            {"content": "上一轮客户消息", "is_self": False, "ui_id": "old-other"},
            {"content": "我的消息", "is_self": True, "ui_id": "self-1"},
            {"content": "最新对方消息", "is_self": False, "trigger_reply": True, "ui_id": "other-2"},
        ]
        poller = FakePoller()
        listener = Listener(BridgeConfig(), SequenceUI([baseline, next_batch]), logging.getLogger("test_listener_reporting"), poller)

        listener._fetch_and_report("夏天")
        poller.messages.clear()
        listener._fetch_and_report("夏天")

        self.assertEqual([msg["content"] for msg in poller.messages], ["我的消息", "最新对方消息"])
        self.assertTrue(poller.messages[0]["is_self"])
        self.assertFalse(poller.messages[0].get("trigger_reply", False))
        self.assertTrue(poller.messages[1]["trigger_reply"])

    def test_customer_messages_before_self_reply_are_reported_for_display_only(self):
        baseline = [
            {"content": "前一轮客户消息", "is_self": False, "trigger_reply": True, "ui_id": "old-other"},
        ]
        next_batch = [
            {"content": "前一轮客户消息", "is_self": False, "ui_id": "old-other"},
            {"content": "好吧", "is_self": False, "ui_id": "other-1"},
            {"content": "自动回复", "is_self": True, "ui_id": "self-1"},
        ]
        poller = FakePoller()
        listener = Listener(BridgeConfig(), SequenceUI([baseline, next_batch]), logging.getLogger("test_listener_reporting"), poller)

        listener._fetch_and_report("summer")
        poller.messages.clear()
        listener._fetch_and_report("summer")

        self.assertEqual([msg["content"] for msg in poller.messages], ["好吧", "自动回复"])
        self.assertFalse(poller.messages[0]["is_self"])
        self.assertFalse(poller.messages[0].get("trigger_reply", False))
        self.assertTrue(poller.messages[1]["is_self"])
        self.assertFalse(poller.messages[1].get("trigger_reply", False))

    def test_partial_scan_does_not_retrigger_previously_seen_customer_message(self):
        baseline = [
            {"content": "抖音，预算500", "is_self": False, "trigger_reply": True, "ui_id": "customer-1"},
            {"content": "可以试试爆款视频挂小风车", "is_self": True, "ui_id": "self-1"},
        ]
        partial_scan = [
            {"content": "抖音，预算500", "is_self": False, "trigger_reply": True, "ui_id": "customer-1-again"},
        ]
        poller = FakePoller()
        listener = Listener(BridgeConfig(), SequenceUI([baseline, partial_scan]), logging.getLogger("test_listener_reporting"), poller)

        listener._fetch_and_report("夏天")
        poller.messages.clear()
        listener._fetch_and_report("夏天")

        self.assertEqual(poller.messages, [])

    def test_no_overlap_scan_keeps_brand_new_customer_message(self):
        baseline = [
            {"content": "上一轮客户消息", "is_self": False, "trigger_reply": True, "ui_id": "old-other"},
            {"content": "上一轮自动回复", "is_self": True, "ui_id": "old-self"},
        ]
        next_batch = [
            {"content": "穷。", "is_self": False, "trigger_reply": True, "ui_id": "new-other"},
        ]
        poller = FakePoller()
        listener = Listener(BridgeConfig(), SequenceUI([baseline, next_batch]), logging.getLogger("test_listener_reporting"), poller)

        listener._fetch_and_report("夏天")
        poller.messages.clear()
        listener._fetch_and_report("夏天")

        self.assertEqual([msg["content"] for msg in poller.messages], ["穷。"])
        self.assertTrue(poller.messages[0]["trigger_reply"])

    def test_prepended_visible_history_does_not_replay_existing_messages(self):
        first_batch = [
            {"content": "customer-1", "is_self": False, "ui_id": "old-a"},
            {"content": "reply-1", "is_self": True, "ui_id": "old-b"},
            {"content": "customer-2", "is_self": False, "trigger_reply": True, "ui_id": "old-c"},
        ]
        second_batch = [
            {"content": "older-customer", "is_self": False, "ui_id": "new-x"},
            {"content": "older-reply", "is_self": True, "ui_id": "new-y"},
            {"content": "customer-1", "is_self": False, "ui_id": "new-a"},
            {"content": "reply-1", "is_self": True, "ui_id": "new-b"},
            {"content": "customer-2", "is_self": False, "trigger_reply": True, "ui_id": "new-c"},
        ]
        poller = FakePoller()
        listener = Listener(BridgeConfig(), SequenceUI([first_batch, second_batch]), logging.getLogger("test_listener_reporting"), poller)

        listener._fetch_and_report("summer")
        poller.messages.clear()
        listener._fetch_and_report("summer")

        self.assertEqual(poller.messages, [])


if __name__ == "__main__":
    unittest.main()
