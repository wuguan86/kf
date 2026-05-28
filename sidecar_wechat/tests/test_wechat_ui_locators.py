import logging
import os
import sys
import unittest

from PIL import Image


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core.config import BridgeConfig
from core.ui import WeChatUI


class FakeControl:
    def __init__(self, automation_id="", class_name="", name="", children=None, runtime_id=None, control_type_name=""):
        self.AutomationId = automation_id
        self.ClassName = class_name
        self.Name = name
        self._children = children or []
        self._runtime_id = runtime_id
        self.ControlTypeName = control_type_name

    def GetChildren(self):
        return self._children

    def GetRuntimeId(self):
        return self._runtime_id


class WeChatUiLocatorTests(unittest.TestCase):
    def setUp(self):
        self.ui = WeChatUI(BridgeConfig(), logging.getLogger("test_wechat_ui_locators"))

    def test_find_descendant_by_automation_id_supports_exact_and_suffix_match(self):
        target = FakeControl(
            automation_id=(
                "content_view.top_content_view.title_h_view.left_v_view."
                "left_content_v_view.left_ui_.big_title_line_h_view.current_chat_name_label"
            ),
            class_name="mmui::XTextView",
            name="夏天",
        )
        root = FakeControl(children=[FakeControl(children=[target])])

        found = self.ui._find_descendant_by_automation_id(root, ["current_chat_name_label"], max_depth=4)

        self.assertIs(found, target)

    def test_config_default_targets_latest_mmui_main_window(self):
        self.assertEqual(BridgeConfig.window_class_name, "mmui::MainWindow")

    def test_date_time_separator_is_not_reported_as_message(self):
        self.assertTrue(self.ui._is_time_separator_text("3月12日 16:43"))

    def test_green_bubble_on_right_is_self_message(self):
        image = Image.new("RGB", (200, 60), (245, 245, 245))
        for x in range(130, 190):
            for y in range(12, 45):
                image.putpixel((x, y), (149, 236, 105))

        direction = self.ui._classify_message_direction_by_bubble_pixels(
            image=image,
            item_bbox=(0, 0, 200, 60),
            list_bbox=(0, 0, 200, 500),
        )

        self.assertEqual(direction, "self")

    def test_wide_green_bubble_reaching_right_half_is_self_message(self):
        image = Image.new("RGB", (575, 74), (245, 245, 245))
        for x in range(65, 415):
            for y in range(12, 58):
                image.putpixel((x, y), (149, 236, 105))

        direction = self.ui._classify_message_direction_by_bubble_pixels(
            image=image,
            item_bbox=(394, 799, 969, 873),
            list_bbox=(394, 479, 969, 893),
        )

        self.assertEqual(direction, "self")

    def test_green_bubble_on_left_is_not_self_message(self):
        image = Image.new("RGB", (200, 60), (245, 245, 245))
        for x in range(10, 70):
            for y in range(12, 45):
                image.putpixel((x, y), (149, 236, 105))

        direction = self.ui._classify_message_direction_by_bubble_pixels(
            image=image,
            item_bbox=(0, 0, 200, 60),
            list_bbox=(0, 0, 200, 500),
        )

        self.assertEqual(direction, "other")

    def test_message_item_mostly_outside_visible_list_is_ignored(self):
        visible = self.ui._is_message_item_visible_enough(
            item_bbox=(370, 360, 945, 415),
            list_bbox=(370, 414, 945, 828),
        )

        self.assertFalse(visible)

    def test_message_item_inside_visible_list_is_kept(self):
        visible = self.ui._is_message_item_visible_enough(
            item_bbox=(370, 527, 945, 582),
            list_bbox=(370, 414, 945, 828),
        )

        self.assertTrue(visible)

    def test_image_copy_targets_prefer_image_descendant_before_whole_item(self):
        image_child = FakeControl(name="图片", control_type_name="ImageControl")
        button_child = FakeControl(name="图片", control_type_name="ButtonControl")
        item = FakeControl(name="[图片]", children=[FakeControl(name="头像", control_type_name="ButtonControl"), image_child, button_child])

        targets = self.ui._build_image_copy_targets(item)

        self.assertGreaterEqual(len(targets), 2)
        self.assertIs(targets[0], image_child)
        self.assertIs(targets[-1], item)


if __name__ == "__main__":
    unittest.main()
