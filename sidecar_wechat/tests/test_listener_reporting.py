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


class ListenerReportingTests(unittest.TestCase):
    def test_self_messages_are_not_reported_to_ai_assistant(self):
        poller = FakePoller()
        listener = Listener(BridgeConfig(), FakeUI(), logging.getLogger("test_listener_reporting"), poller)

        listener._fetch_and_report("夏天")

        self.assertEqual([msg["content"] for msg in poller.messages], ["最新对方消息"])


if __name__ == "__main__":
    unittest.main()
