from __future__ import annotations
import base64
import ctypes
import logging
import os
import random
import re
import threading
import time
import subprocess
import io
import requests
from typing import Any, Dict, List, Optional, Tuple, Iterable

from .config import BridgeConfig
from . import utils

try:
    import pyperclip
except ImportError:
    pyperclip = None

try:
    import uiautomation as auto
except Exception:
    auto = None

try:
    import pythoncom
except Exception:
    pythoncom = None

try:
    from PIL import ImageGrab, ImageStat
except Exception:
    ImageGrab = None
    ImageStat = None

# Ensure DPI Awareness
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(1) 
except:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except:
        pass


def _control_type_name(ctrl: Any) -> str:
    name = getattr(ctrl, "ControlTypeName", None)
    if isinstance(name, str) and name:
        return name
    try:
        ct = getattr(ctrl, "ControlType", None)
        if ct is None:
            return ""
        if hasattr(auto, "ControlType") and hasattr(auto.ControlType, "GetControlTypeName"):
            return str(auto.ControlType.GetControlTypeName(ct))
        return str(ct)
    except Exception:
        return ""


def _safe_attr(ctrl: Any, attr: str) -> str:
    try:
        val = getattr(ctrl, attr, "")
        if val is None:
            return ""
        return str(val)
    except Exception:
        return ""


def _rect_text(ctrl: Any) -> str:
    try:
        rect = getattr(ctrl, "BoundingRectangle", None)
        if rect is None:
            return ""
        return str(rect)
    except Exception:
        return ""


def _iter_descendants(root: Any, max_depth: int) -> Iterable[Any]:
    if max_depth <= 0:
        return
    q: List[Tuple[Any, int]] = [(root, 0)]
    while q:
        node, depth = q.pop(0)
        if depth >= max_depth:
            continue
        children = []
        try:
            children = node.GetChildren() or []
        except Exception:
            children = []
        for child in children:
            yield child
            q.append((child, depth + 1))


def inspect_window_tree(window: Any, logger: logging.Logger) -> None:
    keywords = ["未读", "消息", "输入", "发送", "会话"]
    stack: List[Tuple[Any, int]] = [(window, 0)]
    while stack:
        node, depth = stack.pop()
        control_type = _control_type_name(node)
        name = _safe_attr(node, "Name")
        automation_id = _safe_attr(node, "AutomationId")
        rect_text = _rect_text(node)
        keyword_hit = any(k in name or k in automation_id for k in keywords)
        prefix = "HIGHLIGHT" if keyword_hit else "NODE"
        indent = "  " * depth
        logger.info(
            "%s %s%s | Name=%s | AutomationId=%s | Rect=%s",
            prefix,
            indent,
            control_type,
            name,
            automation_id,
            rect_text,
        )
        try:
            children = node.GetChildren() or []
        except Exception:
            children = []
        for child in reversed(children):
            stack.append((child, depth + 1))


class WeChatUI:
    def __init__(self, cfg: BridgeConfig, logger: logging.Logger) -> None:
        self._cfg = cfg
        self._logger = logger
        self._uia_lock = threading.RLock()
        self._cached_main = None
        self._tree_logged_handle = None
        self._last_unread_debug_time = 0.0
        
        # ======== 新增：核心 UI 控件缓存 ========
        self._cached_session_list = None
        self._cached_message_list = None
        self._cached_input_box = None
        self._cached_chat_title_ctrl = None
        self._last_direction_pixel_stats: Dict[str, int] = {"left": 0, "right": 0, "total": 0}

    def _normalize_contact_name(self, name: str) -> str:
        if not name:
            return ""
        name = name.strip()
        if not name:
            return ""
        name = re.sub(r"\[\d+条\]", "", name)
        
        parts = [part.strip() for part in name.splitlines() if part.strip()]
        if parts:
            name = parts[0]
        name = re.sub(r"\s+", " ", name).strip()
        name = re.sub(r"(?i)^new\b[\s:：\-]*", "", name).strip()
        name = re.sub(r"\s*[|｜·•\-—:：]\s*$", "", name).strip()
        name = re.sub(r"\s*(?:[上下]午)?\s*\d{1,2}:\d{2}(?::\d{2})?$", "", name).strip()
        name = re.sub(r"(?:\d+\s*条新消息|未读)$", "", name).strip()
        return name

    def _is_invalid_chat_title_candidate(self, name: str) -> bool:
        normalized = self._normalize_contact_name(name)
        if not normalized:
            return True
        if len(normalized) > 60:
            return True
        blocked = {
            "微信",
            "聊天信息",
            "文件传输助手",
            "搜索",
            "发起群聊",
            "置顶",
            "最小化",
            "最大化",
            "关闭",
            "聊天",
            "通讯录",
            "收藏",
            "朋友圈",
            "看一看",
            "搜一搜",
            "设置及其他",
            "语音聊天",
            "视频聊天",
            "发送",
            "发送(S)",
        }
        return normalized in blocked

    def _brief_control(self, ctrl: Any) -> str:
        return f"{_control_type_name(ctrl)}|{_safe_attr(ctrl, 'ClassName')}|{_safe_attr(ctrl, 'Name')}|{_rect_text(ctrl)}"

    def _click_control(self, ctrl: Any) -> bool:
        if ctrl is None:
            return False
        
        # Ensure visible
        try:
            if not ctrl.IsOffscreen:
                 ctrl.SetFocus()
        except:
            pass

        try:
            # Try to get center point explicitly
            rect = getattr(ctrl, "BoundingRectangle", None)
            if rect:
                x = (rect.left + rect.right) // 2
                y = (rect.top + rect.bottom) // 2
                auto.Click(x, y)
                return True
            else:
                ctrl.Click(simulateMove=True)
                return True
        except Exception:
            pass
            
        try:
            ctrl.Click()
            return True
        except Exception:
            return False

    def _find_named_clickable(self, root: Any, names: List[str], search_depth: int = 18) -> Optional[Any]:
        if auto is None or root is None:
            return None
        normalized = [str(name).strip() for name in names if str(name).strip()]
        if not normalized:
            return None
        candidates: List[Tuple[int, Any]] = []
        for ctrl in _iter_descendants(root, max_depth=search_depth):
            text = (getattr(ctrl, "Name", "") or "").strip()
            if not text:
                continue
            matched = False
            for name in normalized:
                if text == name or name in text:
                    matched = True
                    break
            if not matched:
                continue
            rect = getattr(ctrl, "BoundingRectangle", None)
            bbox = utils.rect_to_bbox(rect)
            if bbox is None:
                continue
            candidates.append((bbox[1], ctrl))
        if not candidates:
            return None
        candidates.sort(key=lambda x: x[0])
        return candidates[0][1]

    def _find_descendant_by_automation_id(
        self,
        root: Any,
        automation_ids: List[str],
        max_depth: int = 18,
        control_type: str = "",
    ) -> Optional[Any]:
        """按 AutomationId 定位新版微信控件，支持完整匹配和后缀匹配。"""
        if root is None:
            return None

        expected_ids = [str(item).strip() for item in automation_ids if str(item).strip()]
        if not expected_ids:
            return None

        def matched(ctrl: Any) -> bool:
            automation_id = _safe_attr(ctrl, "AutomationId")
            if not automation_id:
                return False
            if control_type and _control_type_name(ctrl) != control_type:
                return False
            return any(automation_id == item or automation_id.endswith(item) for item in expected_ids)

        if matched(root):
            return root

        for ctrl in _iter_descendants(root, max_depth=max_depth):
            if matched(ctrl):
                return ctrl
        return None

    def _get_moments_window(self, main_window: Any) -> Optional[Any]:
        if auto is None:
            return None

        self._logger.info("尝试获取朋友圈窗口...")

        # Check if Moments window already exists
        # Use Win32 API directly to avoid UIA hanging on global search
        try:
            hwnd = ctypes.windll.user32.FindWindowW("SnsWnd", "朋友圈")
            if hwnd and hwnd != 0:
                self._logger.info(f"发现已存在的朋友圈窗口, HWND: {hwnd}")
                return auto.ControlFromHandle(hwnd)
        except Exception as e:
            self._logger.warning(f"检查朋友圈窗口存在性时出错: {e}")

        # Try to open it
        self._logger.info("尝试从主窗口进入朋友圈...")
        
        # Ensure main window is accessible
        try:
            if getattr(main_window, "IsIconic", False):
                self._logger.info("主窗口最小化中，尝试还原...")
                main_window.ShowWindow(auto.SW.Restore)
            main_window.SetFocus()
            self._logger.debug("主窗口已聚焦")
        except Exception as e:
            self._logger.warning(f"主窗口聚焦失败: {e}")

        # Strategy A: Look for "导航" ToolBar first (Based on control tree)
        self._logger.debug("正在查找[导航]工具栏(ToolBarControl)...")
        nav_toolbar = None
        
        # Search for ToolBarControl with Name='导航'
        try:
            for ctrl in _iter_descendants(main_window, max_depth=8):
                if _control_type_name(ctrl) == "ToolBarControl" and "导航" in _safe_attr(ctrl, "Name"):
                    nav_toolbar = ctrl
                    self._logger.debug(f"找到[导航]工具栏: {self._brief_control(ctrl)}")
                    break
        except Exception as e:
            self._logger.warning(f"遍历查找导航栏时出错: {e}")
        
        found_btn = False
        if nav_toolbar:
            self._logger.debug("在[导航]工具栏中查找[朋友圈]按钮...")
            try:
                # Direct children or slight depth
                moments_btn = self._find_named_clickable(nav_toolbar, ["朋友圈"], search_depth=4)
                if moments_btn:
                    self._logger.info(f"找到[朋友圈]按钮: {self._brief_control(moments_btn)}，尝试点击...")
                    if self._click_control(moments_btn):
                        self._logger.debug("点击操作已执行")
                        found_btn = True
                    else:
                        self._logger.warning("点击操作失败")
                else:
                    self._logger.warning("[导航]工具栏中未找到[朋友圈]按钮")
            except Exception as e:
                self._logger.warning(f"在导航栏中操作时出错: {e}")
        else:
            self._logger.warning("未找到[导航]工具栏，尝试全局搜索...")

        if not found_btn:
            # Strategy B: Original Logic (Global search or 'Discovery' tab)
            self._logger.debug("进入备用搜索策略...")
            # 1. Look for direct "朋友圈" button (sidebar)
            moments_btn = self._find_named_clickable(main_window, ["朋友圈"], search_depth=12)
            if moments_btn:
                self._logger.info("点击侧边栏[朋友圈]按钮 (全局搜索)")
                self._click_control(moments_btn)
            else:
                # 2. Look for "发现" -> "朋友圈"
                self._logger.info("未找到侧边栏[朋友圈]，尝试寻找[发现]...")
                discover = self._find_named_clickable(main_window, ["发现"], search_depth=12)
                if discover:
                    self._logger.info("点击[发现]按钮")
                    self._click_control(discover)
                    time.sleep(0.8) # Wait for animation
                    moments_btn = self._find_named_clickable(main_window, ["朋友圈"], search_depth=12)
                    if moments_btn:
                        self._logger.info("点击[发现]面板中的[朋友圈]按钮")
                        self._click_control(moments_btn)
                    else:
                        self._logger.warning("[发现]面板中未找到[朋友圈]按钮")
                else:
                    self._logger.warning("未找到[发现]按钮")

        # Wait for window to appear
        self._logger.debug("等待朋友圈窗口出现...")
        sns_wnd = None
        for i in range(12):  # 6 seconds max
            # Re-check via FindWindowW to avoid hang
            hwnd = ctypes.windll.user32.FindWindowW("SnsWnd", "朋友圈")
            if hwnd and hwnd != 0:
                self._logger.info(f"朋友圈窗口成功打开, HWND: {hwnd}")
                sns_wnd = auto.ControlFromHandle(hwnd)
                break
            time.sleep(0.5)

        if not sns_wnd:
            self._logger.warning("尝试打开操作后，仍未检测到朋友圈窗口")
            return None
            
        return sns_wnd

    def _extract_item_text(self, item: Any) -> str:
        parts: List[str] = []
        base = (getattr(item, "Name", "") or "").strip()
        if base:
            parts.append(base)
        for ctrl in _iter_descendants(item, max_depth=6):
            name = (getattr(ctrl, "Name", "") or "").strip()
            if not name:
                continue
            if len(name) > 100:
                continue
            parts.append(name)
        if not parts:
            return ""
        merged = "\n".join(parts)
        merged = re.sub(r"\n{2,}", "\n", merged).strip()
        return merged

    def _extract_item_author(self, text: str) -> str:
        if not text:
            return ""
        for line in text.splitlines():
            value = line.strip()
            if not value:
                continue
            if value in {"朋友圈", "发现", "微信"}:
                continue
            if re.fullmatch(r"(今天|昨天|星期.*|\d{1,2}:\d{2}|[上下]午.*)", value):
                continue
            return value
        return ""

    def _collect_moments_items(self, window: Any) -> List[Any]:
        items: List[Tuple[int, Any]] = []
        self._logger.debug("开始收集朋友圈条目(ListItem)...")
        
        for ctrl in _iter_descendants(window, max_depth=26):
            ct = _control_type_name(ctrl)
            cls_name = _safe_attr(ctrl, "ClassName")
            # Loose match for list items
            if ct != "ListItemControl" and "ListItem" not in cls_name and "listitem" not in cls_name.lower():
                continue
            rect = getattr(ctrl, "BoundingRectangle", None)
            bbox = utils.rect_to_bbox(rect)
            if bbox is None:
                continue
            left, top, right, bottom = bbox
            width = right - left
            height = bottom - top
            
            # self._logger.debug(f"Candidate Item: {cls_name} size={width}x{height} top={top}")
            
            if width < 300 or height < 40: # Relaxed width check
                continue
            if top < 80:
                continue
            items.append((top, ctrl))
            
        if not items:
            self._logger.warning("未找到任何朋友圈条目 (items is empty)")
            return []
            
        items.sort(key=lambda x: x[0])
        unique: List[Any] = []
        last_top = -99999
        for top, ctrl in items:
            if abs(top - last_top) < 8:
                continue
            unique.append(ctrl)
            last_top = top
            if len(unique) >= 30:
                break
        
        self._logger.info(f"收集到 {len(unique)} 个有效朋友圈条目")
        return unique

    def _find_interaction_button(self, item: Any) -> Optional[Any]:
        """Find the comment/interaction button within a moments item"""
        # Strategy 1: Look for "评论" named button
        btn = self._find_named_clickable(item, ["评论"], search_depth=8)
        if btn:
            return btn
            
        # Strategy 2: Look for button with specific characteristics (often bottom-right)
        # The interaction button is usually small and on the right side
        try:
            item_rect = getattr(item, "BoundingRectangle", None)
            item_bbox = utils.rect_to_bbox(item_rect)
            if not item_bbox:
                return None
                
            item_right = item_bbox[2]
            item_bottom = item_bbox[3]
            
            candidates = []
            for child in _iter_descendants(item, max_depth=8):
                ct = _control_type_name(child)
                if ct not in ["ButtonControl", "PaneControl", "ImageControl"]:
                    continue
                
                rect = getattr(child, "BoundingRectangle", None)
                bbox = utils.rect_to_bbox(rect)
                if not bbox:
                    continue
                    
                # Check if it's in the bottom-right area
                # (This is a heuristic and might need adjustment)
                l, t, r, b = bbox
                w = r - l
                h = b - t
                
                # Button size is usually small icon
                if 20 <= w <= 50 and 15 <= h <= 40:
                    candidates.append((child, r, b))
            
            # Sort by proximity to bottom-right
            # Maximize right and bottom
            if candidates:
                candidates.sort(key=lambda x: (x[1] + x[2]), reverse=True)
                # self._logger.debug(f"Found interaction button candidate via heuristic: {self._brief_control(candidates[0][0])}")
                return candidates[0][0]
                
        except Exception as e:
            self._logger.warning(f"Error finding interaction button: {e}")
            
        return None

    def execute_marketing_like(self, config: Dict[str, Any], state: Dict[str, Any]) -> Dict[str, Any]:
        if auto is None:
            return {"ok": False, "error": "uia_not_ready"}
        
        self._logger.info("开始执行朋友圈点赞任务...")
        
        like_start = int(config.get("likeIntervalStart") or 60)
        like_end = int(config.get("likeIntervalEnd") or like_start)
        if like_end < like_start:
            like_end = like_start
        per_friend_limit = max(1, int(config.get("maxDailyLikesPerFriend") or 3))
        total_limit = max(1, int(config.get("maxDailyTotalLikes") or 100))
        keyword_filter = [str(item).strip() for item in (config.get("keywordFilter") or []) if str(item).strip()]

        today = utils.today_key()
        if state.get("date") != today:
            state.clear()
            state.update({
                "date": today,
                "totalLikes": 0,
                "perFriendLikes": {},
                "actedSignatures": set()
            })

        total_likes = int(state.get("totalLikes") or 0)
        per_friend = state.get("perFriendLikes") or {}
        if not isinstance(per_friend, dict):
            per_friend = {}
            state["perFriendLikes"] = per_friend
        acted_signatures = state.get("actedSignatures")
        if isinstance(acted_signatures, list):
            acted_signatures = set(acted_signatures)
            state["actedSignatures"] = acted_signatures
        elif not isinstance(acted_signatures, set):
            acted_signatures = set()
            state["actedSignatures"] = acted_signatures

        if total_likes >= total_limit:
            self._logger.info("今日点赞总数已达上限，跳过任务")
            return {
                "ok": True,
                "skipped": True,
                "reason": "daily_total_limit_reached",
                "dailyTotalLikes": total_likes,
                "dailyTotalLimit": total_limit
            }

        with self._uia_lock:
            window = self.get_main_window()
            if window is None:
                return {"ok": False, "error": "wechat_window_not_found"}

            moments_window = self._get_moments_window(window)
            if not moments_window:
                return {"ok": False, "error": "moments_window_not_found"}

            items = self._collect_moments_items(moments_window)
            if not items:
                return {"ok": False, "error": "moments_item_not_found"}

            for index, item in enumerate(items):
                item_text = self._extract_item_text(item)
                # self._logger.info(f"处理第 {index+1} 条: {item_text[:30]}...")
                
                if not item_text:
                    self._logger.debug(f"第 {index+1} 条无文本，跳过")
                    continue
                signature = utils.sha1_text(item_text)
                if signature in acted_signatures:
                    self._logger.debug(f"第 {index+1} 条已处理过(Signature)，跳过")
                    continue

                if keyword_filter and any(word in item_text for word in keyword_filter):
                    self._logger.debug(f"第 {index+1} 条命中关键词过滤，跳过")
                    continue

                author = self._extract_item_author(item_text) or "unknown"
                friend_count = int(per_friend.get(author) or 0)
                if friend_count >= per_friend_limit:
                    self._logger.debug(f"用户 {author} 点赞数已达上限，跳过")
                    continue

                # Check if already liked based on text (if visible)
                if "取消" in item_text or "已赞" in item_text:
                    self._logger.debug(f"第 {index+1} 条检测到已赞状态，跳过")
                    acted_signatures.add(signature)
                    continue

                # Find the comment/interaction button to open the popup
                # Usually named "评论" or just a button at the bottom right
                self._logger.debug(f"正在寻找第 {index+1} 条的互动按钮...")
                menu_btn = self._find_interaction_button(item)
                if menu_btn is None:
                    self._logger.debug(f"第 {index+1} 条未找到互动按钮，跳过")
                    # Fallback: try to find the button by position or other property if needed
                    # For now, skip if not found
                    continue

                self._logger.debug(f"点击互动按钮: {self._brief_control(menu_btn)}")
                if not self._click_control(menu_btn):
                    self._logger.warning("点击互动按钮失败")
                    continue
                
                # Wait for the popup (SnsLikeToastWnd)
                # Use a loop or Exists with timeout
                self._logger.debug("等待点赞弹窗(SnsLikeToastWnd)...")
                popup = None
                for _ in range(5): # Increased wait time
                    popup_pane = auto.PaneControl(ClassName="SnsLikeToastWnd")
                    if popup_pane.Exists(0, 0):
                        popup = popup_pane
                        self._logger.debug("找到弹窗 (PaneControl)")
                        break
                    popup_wnd = auto.WindowControl(ClassName="SnsLikeToastWnd")
                    if popup_wnd.Exists(0, 0):
                        popup = popup_wnd
                        self._logger.debug("找到弹窗 (WindowControl)")
                        break
                    # Also try finding by Name="点赞" container? No, usually class name is reliable.
                    time.sleep(0.3)
                
                if popup is None or not popup.Exists(1, 0.2):
                    self._logger.warning("未找到点赞弹窗")
                    # Try searching as child of main window or moments window just in case
                    # But usually it is top level.
                    continue

                # Find "赞" button in popup
                self._logger.debug("在弹窗中查找[赞]按钮...")
                like_btn = self._find_named_clickable(popup, ["赞"], search_depth=5)
                
                if like_btn is None:
                    self._logger.debug("未找到[赞]按钮 (可能已赞或界面不匹配)")
                    # Close popup if possible or just continue
                    # Clicking elsewhere closes it usually
                    continue

                self._logger.info(f"找到[赞]按钮: {self._brief_control(like_btn)}，执行点击...")
                if not self._click_control(like_btn):
                    self._logger.warning("点击[赞]按钮失败")
                    continue

                total_likes += 1
                state["totalLikes"] = total_likes
                per_friend[author] = friend_count + 1
                acted_signatures.add(signature)
                self._logger.info(f"点赞成功! Author: {author}, Total: {total_likes}")
                return {
                    "ok": True,
                    "success": True,
                    "liked": True,
                    "author": author,
                    "dailyTotalLikes": total_likes,
                    "dailyTotalLimit": total_limit,
                    "friendLikes": int(per_friend.get(author) or 0),
                    "friendLimit": per_friend_limit,
                    "likeIntervalStart": like_start,
                    "likeIntervalEnd": like_end
                }

            self._logger.info("遍历完所有可见条目，未进行点赞 (可能是无合适条目或都已处理)")
            return {
                "ok": True,
                "success": True,
                "liked": False,
                "reason": "no_eligible_item",
                "dailyTotalLikes": total_likes,
                "dailyTotalLimit": total_limit
            }

    def execute_marketing_comment(self, config: Dict[str, Any], state: Dict[str, Any]) -> Dict[str, Any]:
        if auto is None:
            return {"ok": False, "error": "uia_not_ready"}
        
        self._logger.info("开始执行朋友圈评论任务...")
        
        backend_url = config.get("backendUrl")
        token = config.get("token")
        tenant_id = config.get("tenantId")
        if not backend_url or not token:
            return {"ok": False, "error": "missing_backend_config"}

        comment_start = int(config.get("commentIntervalStart") or 120)
        comment_end = int(config.get("commentIntervalEnd") or comment_start)
        if comment_end < comment_start:
            comment_end = comment_start
        per_friend_limit = max(1, int(config.get("maxDailyCommentsPerFriend") or 3))
        total_limit = max(1, int(config.get("maxDailyTotalComments") or 50))
        keyword_filter = [str(item).strip() for item in (config.get("keywordFilter") or []) if str(item).strip()]

        today = utils.today_key()
        if state.get("date") != today:
            state.clear()
            state.update({
                "date": today,
                "totalComments": 0,
                "perFriendComments": {},
                "actedSignatures": set()
            })

        total_comments = int(state.get("totalComments") or 0)
        per_friend = state.get("perFriendComments") or {}
        if not isinstance(per_friend, dict):
            per_friend = {}
            state["perFriendComments"] = per_friend
        acted_signatures = state.get("actedSignatures")
        if isinstance(acted_signatures, list):
            acted_signatures = set(acted_signatures)
            state["actedSignatures"] = acted_signatures
        elif not isinstance(acted_signatures, set):
            acted_signatures = set()
            state["actedSignatures"] = acted_signatures

        if total_comments >= total_limit:
            self._logger.info("今日评论总数已达上限，跳过任务")
            return {
                "ok": True,
                "skipped": True,
                "reason": "daily_total_limit_reached",
                "dailyTotalComments": total_comments,
                "dailyTotalLimit": total_limit
            }

        with self._uia_lock:
            window = self.get_main_window()
            if window is None:
                return {"ok": False, "error": "wechat_window_not_found"}

            moments_window = self._get_moments_window(window)
            if not moments_window:
                return {"ok": False, "error": "moments_window_not_found"}

            items = self._collect_moments_items(moments_window)
            if not items:
                return {"ok": False, "error": "moments_item_not_found"}

            for index, item in enumerate(items):
                item_text = self._extract_item_text(item)
                
                if not item_text:
                    self._logger.debug(f"第 {index+1} 条无文本，跳过")
                    continue
                signature = utils.sha1_text(item_text)
                if signature in acted_signatures:
                    self._logger.debug(f"第 {index+1} 条已处理过(Signature)，跳过")
                    continue

                if keyword_filter and any(word in item_text for word in keyword_filter):
                    self._logger.debug(f"第 {index+1} 条命中关键词过滤，跳过")
                    continue

                author = self._extract_item_author(item_text) or "unknown"
                friend_count = int(per_friend.get(author) or 0)
                if friend_count >= per_friend_limit:
                    self._logger.debug(f"用户 {author} 评论数已达上限，跳过")
                    continue

                # Find the interaction button
                self._logger.debug(f"正在寻找第 {index+1} 条的互动按钮...")
                menu_btn = self._find_interaction_button(item)
                if menu_btn is None:
                    self._logger.debug(f"第 {index+1} 条未找到互动按钮，跳过")
                    continue

                self._logger.debug(f"点击互动按钮: {self._brief_control(menu_btn)}")
                if not self._click_control(menu_btn):
                    self._logger.warning("点击互动按钮失败")
                    continue
                
                # Wait for popup
                self._logger.debug("等待评论弹窗(SnsLikeToastWnd)...")
                popup = None
                for _ in range(5):
                    popup_pane = auto.PaneControl(ClassName="SnsLikeToastWnd")
                    if popup_pane.Exists(0, 0):
                        popup = popup_pane
                        break
                    popup_wnd = auto.WindowControl(ClassName="SnsLikeToastWnd")
                    if popup_wnd.Exists(0, 0):
                        popup = popup_wnd
                        break
                    time.sleep(0.3)
                
                if popup is None or not popup.Exists(1, 0.2):
                    self._logger.warning("未找到评论弹窗")
                    continue

                # Find "评论" button in popup
                self._logger.debug("在弹窗中查找[评论]按钮...")
                comment_btn = self._find_named_clickable(popup, ["评论"], search_depth=5)
                
                if comment_btn is None:
                    self._logger.debug("未找到[评论]按钮")
                    continue

                self._logger.info(f"找到[评论]按钮，执行点击...")
                if not self._click_control(comment_btn):
                    self._logger.warning("点击[评论]按钮失败")
                    continue

                # Wait for input box
                # Usually "EditControl" or "PaneControl" with "评论" name or similar
                # Or just wait a bit and type
                time.sleep(1.0) # Wait for input box to appear

                # Call API to generate comment
                try:
                    api_url = f"{backend_url.rstrip('/')}/api/user/marketing/comment/generate"
                    self._logger.info(f"请求后端生成评论... URL: {api_url}")
                    
                    # Ensure token has Bearer prefix if needed
                    auth_header = token
                    if token and not token.lower().startswith("bearer "):
                        auth_header = f"Bearer {token}"
                    
                    headers = {
                        "Authorization": auth_header, 
                        "Content-Type": "application/json"
                    }
                    if tenant_id:
                        headers["X-Tenant-Id"] = str(tenant_id)

                    resp = requests.post(
                        api_url,
                        json={"postContent": item_text, "userNickname": author},
                        headers=headers,
                        timeout=60
                    )
                    
                    if resp.status_code != 200:
                        self._logger.error(f"生成评论失败: {resp.status_code} {resp.text}")
                        # Cancel comment input by pressing ESC
                        auto.SendKeys('{Esc}')
                        continue
                    
                    res_json = resp.json()

                    if res_json.get("code") != 0:
                        self._logger.error(f"生成评论API错误: {res_json}")
                        auto.SendKeys('{Esc}')
                        continue
                        
                    comment_content = res_json.get("data")
                    if not comment_content:
                        self._logger.warning("生成的评论内容为空")
                        auto.SendKeys('{Esc}')
                        continue
                        
                    self._logger.info(f"生成的评论: {comment_content}")
                    
                    # Find input box and type
                    # Often EditControl in Moments window
                    edit_box = moments_window.EditControl(searchDepth=10)
                    if not edit_box.Exists(0, 0):
                        # Try searching globally or deeper
                        edit_box = auto.EditControl(searchFromControl=moments_window, searchDepth=15)
                    
                    if edit_box.Exists(0, 0):
                        edit_box.Click(simulateMove=False)
                        edit_box.SendKeys(comment_content)
                        time.sleep(0.5)
                        
                        # Find Send button? Or just Enter?
                        # Usually there is a "发送" button nearby
                        # Or Enter key if configured? WeChat usually requires Ctrl+Enter or just Enter
                        # Safe bet: Find "发送" button
                        send_btn = self._find_named_clickable(moments_window, ["发送", "Send"])
                        if send_btn and send_btn.Exists(0, 0):
                            send_btn.Click()
                        else:
                            # Try Enter
                            auto.SendKeys('{Enter}')
                    else:
                        self._logger.warning("未找到输入框，无法评论")
                        continue

                except Exception as e:
                    self._logger.error(f"评论生成或发送过程异常: {e}")
                    continue

                total_comments += 1
                state["totalComments"] = total_comments
                per_friend[author] = friend_count + 1
                acted_signatures.add(signature)
                self._logger.info(f"评论成功! Author: {author}, Total: {total_comments}")
                return {
                    "ok": True,
                    "success": True,
                    "commented": True,
                    "author": author,
                    "dailyTotalComments": total_comments,
                    "dailyTotalLimit": total_limit,
                    "friendComments": int(per_friend.get(author) or 0),
                    "friendLimit": per_friend_limit,
                    "commentIntervalStart": comment_start,
                    "commentIntervalEnd": comment_end
                }

            self._logger.info("遍历完所有可见条目，未进行评论")
            return {
                "ok": True,
                "success": True,
                "commented": False,
                "reason": "no_eligible_item",
                "dailyTotalComments": total_comments,
                "dailyTotalLimit": total_limit
            }


    def _get_wechat_pids(self) -> List[int]:
        pids = []
        for name in ["WeChat.exe", "Weixin.exe", "WeChatAppEx.exe"]:
            try:
                cmd = f'tasklist /FI "IMAGENAME eq {name}" /FO CSV /NH'
                output = subprocess.check_output(cmd, shell=True).decode("gbk", errors="ignore")
                for line in output.splitlines():
                    if not line.strip():
                        continue
                    parts = line.split(',')
                    if len(parts) >= 2:
                        pid_str = parts[1].strip('"')
                        if pid_str.isdigit():
                            pids.append(int(pid_str))
            except Exception as e:
                self._logger.warning(f"获取进程PID失败 {name}: {e}")
        return list(set(pids))

    def _find_main_window(self) -> Any:
        if auto is None:
            raise RuntimeError("uiautomation 未加载")
        
        self._logger.info("开始查找新版微信主窗口: ClassName=%s Name=%s", self._cfg.window_class_name, self._cfg.window_name)
        
        if hasattr(auto, "SetGlobalSearchTimeout"):
            try:
                auto.SetGlobalSearchTimeout(0.5)
            except Exception:
                pass

        if hasattr(auto, "SetTransactionTimeout"):
            try:
                auto.SetTransactionTimeout(500)
            except Exception:
                pass
        
        # 策略 0：新版微信窗口类名稳定为 mmui::MainWindow，优先走 Win32 精确查找。
        try:
            hwnd = ctypes.windll.user32.FindWindowW(self._cfg.window_class_name, None)
            if hwnd and hwnd != 0:
                self._logger.info(f"通过 Win32 精确找到微信窗口 handle: {hwnd}")
                if ctypes.windll.user32.IsHungAppWindow(hwnd):
                    self._logger.warning(f"微信窗口句柄 {hwnd} 无响应，跳过本次使用。")
                else:
                    window = auto.ControlFromHandle(hwnd)
                    if window.Exists(0, 0):
                        return window
        except Exception as e:
            self._logger.warning(f"Win32 查找微信窗口失败: {e}")

        # Strategy 1: Global UIA Search
        try:
            window = auto.WindowControl(
                searchDepth=1,
                ClassName=self._cfg.window_class_name,
            )
            if window.Exists(0, 0):
                self._logger.info("通过 UIA 全局搜索找到微信窗口")
                return window
        except Exception:
            pass
        
        # Strategy 2: Fallback to PID search
        pids = self._get_wechat_pids()
        for pid in pids:
            try:
                window = auto.WindowControl(
                    searchDepth=1,
                    ProcessId=pid,
                    ClassName=self._cfg.window_class_name,
                    Name=self._cfg.window_name,
                )
                if window.Exists(0, 0):
                    return window
                
                # Loose match (just Name)
                window_loose = auto.WindowControl(
                    searchDepth=1,
                    ProcessId=pid,
                    Name=self._cfg.window_name,
                )
                if window_loose.Exists(0, 0):
                    return window_loose
            except Exception:
                pass
                
        self._logger.warning("未找到微信主窗口")
        return None

    def get_main_window(self) -> Any:
        with self._uia_lock:
            if self._cached_main is not None:
                try:
                    if self._cached_main.Exists(0, 0):
                        return self._cached_main
                except Exception:
                    self._cached_main = None
            win = self._find_main_window()
            self._cached_main = win
            if win is not None:
                self._log_window_tree(win)
            return win

    def _log_window_tree(self, window: Any) -> None:
        handle = getattr(window, "NativeWindowHandle", None)
        if handle is None:
            handle = id(window)
        
        if self._tree_logged_handle == handle:
            return
        self._tree_logged_handle = handle
        try:
            children = window.GetChildren() or []
            self._logger.info("Window has %d children", len(children))
        except Exception:
            pass

    def log_ready_snapshot(self, window: Any) -> None:
        if window is None:
            return
        with self._uia_lock:
            name = getattr(window, "Name", "") or ""
            class_name = getattr(window, "ClassName", "") or ""
            pid = getattr(window, "ProcessId", None)
            handle = getattr(window, "NativeWindowHandle", None)
            rect_text = _rect_text(window)
            self._logger.info("主窗口就绪快照: Name=%s Class=%s PID=%s Handle=%s Rect=%s", name, class_name, pid, handle, rect_text)
            
            session_list = self._locate_session_list(window)
            if session_list is not None:
                s_name = _safe_attr(session_list, "Name")
                s_class = _safe_attr(session_list, "ClassName")
                self._logger.info("会话列表控件: Class=%s Name=%s", s_class, s_name)
            else:
                self._logger.info("未找到会话列表控件")

            message_list = self._locate_message_list(window)
            if message_list is not None:
                m_name = _safe_attr(message_list, "Name")
                m_class = _safe_attr(message_list, "ClassName")
                self._logger.info("消息列表控件: Class=%s Name=%s", m_class, m_name)
            else:
                self._logger.info("未找到消息列表控件")

    def _locate_session_list(self, window: Any) -> Optional[Any]:
        if auto is None:
            return None
            
        # 1. 优先使用缓存 (0毫秒级响应)
        if self._cached_session_list and self._cached_session_list.Exists(0, 0):
            return self._cached_session_list

        # 2. 新版微信优先使用稳定 AutomationId=session_list。
        target = self._find_descendant_by_automation_id(
            window,
            ["session_list"],
            max_depth=24,
            control_type="ListControl",
        )
        if target is not None:
            self._logger.debug("_locate_session_list Found AutomationId='session_list'")
            self._cached_session_list = target
            return target
            
        # 3. 名称兜底：新版微信中文环境仍可能暴露 Name="会话"。
        try:
            target = auto.ListControl(searchFromControl=window, searchDepth=12, Name="会话")
            if target and target.Exists(0, 0):
                self._logger.debug("_locate_session_list Found Name='会话'")
                self._cached_session_list = target
                return target
        except Exception:
            pass

        # 4. 英文环境兜底。
        try:
            target = auto.ListControl(searchFromControl=window, searchDepth=12, Name="Session")
            if target and target.Exists(0, 0):
                self._logger.debug("_locate_session_list Found Name='Session'")
                self._cached_session_list = target
                return target
        except Exception:
            pass
              
        self._logger.warning("未找到微信会话列表，已尝试 AutomationId=session_list 和名称会话/Session。")
        return None

    def _locate_message_list(self, window: Any) -> Optional[Any]:
        if auto is None:
            return None
            
        # 1. 优先使用缓存，并验证其是否真的可用
        if self._cached_message_list:
            try:
                if self._cached_message_list.Exists(0, 0):
                    # 简单测试一下是否能获取到边界，如果抛出异常说明底层句柄已失效
                    _ = self._cached_message_list.BoundingRectangle
                    return self._cached_message_list
            except Exception:
                pass
            self._cached_message_list = None # 失效则清理
            
        # 2. 新版微信优先使用稳定 AutomationId=chat_message_list。
        target = self._find_descendant_by_automation_id(
            window,
            ["chat_message_list"],
            max_depth=24,
            control_type="ListControl",
        )
        if target is not None:
            self._cached_message_list = target
            return target

        # 3. 名称兜底。
        try:
            target = auto.ListControl(searchFromControl=window, searchDepth=15, Name="消息")
            if target and target.Exists(0, 0):
                self._cached_message_list = target
                return target
        except Exception:
            pass

        # 4. 英文系统兼容。
        try:
            target = auto.ListControl(searchFromControl=window, searchDepth=15, Name="Message")
            if target and target.Exists(0, 0):
                self._cached_message_list = target
                return target
        except Exception:
            pass

        return None

    def find_unread_sessions(self) -> List[Any]:
        if auto is None:
            return []
        with self._uia_lock:
            window = self.get_main_window()
            if window is None:
                return []

            session_list = self._locate_session_list(window)
            if session_list is None:
                return []

            unread_items: List[Any] = []
            children = session_list.GetChildren() or []
            for item in children[:20]:
                if len(unread_items) >= self._cfg.unread_max_per_round:
                    break
                try:
                    if self._is_session_item_unread(item):
                        unread_items.append(item)
                except Exception:
                    continue
            return unread_items

    def _is_session_item_unread(self, item: Any) -> bool:
        item_name = getattr(item, "Name", "") or ""
        
        if item_name in ("服务号", "订阅号", "Subscription Accounts", "订阅号消息", "公众号", "文件传输助手"):
            return False
            
        if re.search(r"(\[\d+条\]|\d+条新消息|未读)", item_name):
            return True

        # 彻底废弃极其卡顿的 _iter_descendants
        # 微信的小红点通常在这个会话控件的最外层子节点中
        try:
            children = item.GetChildren() or []
            for ctrl in children:
                # 检查第一层和第二层子节点即可
                sub_children = ctrl.GetChildren() or []
                for sub_ctrl in sub_children:
                    name = (getattr(sub_ctrl, "Name", "") or "").strip()
                    if name and (re.fullmatch(r"\d+", name) or name == "99+"):
                        return True
                    if any(k in name for k in ("未读", "条新消息", "new message", "badge", "reddot")):
                        return True
        except Exception:
            pass
                
        return False

    def _check_and_exit_subscription_folder(self, window: Any) -> bool:
        if auto is None or window is None:
            return False
            
        targets = ["服务号", "订阅号", "Subscription Accounts", "订阅号消息", "公众号"]
        for name in targets:
            try:
                btn = auto.ButtonControl(searchFromControl=window, searchDepth=12, Name=name)
                if btn.Exists(0, 0):
                    rect = getattr(btn, "BoundingRectangle", None)
                    bbox = utils.rect_to_bbox(rect) if rect else None
                    if bbox:
                        l, t, r, b = bbox
                        if l < 350 and t < 200:
                            btn.Click(simulateMove=True)
                            time.sleep(1.0)
                            return True
            except Exception:
                pass
        return False

    def click_session_item(self, item: Any) -> Optional[str]:
        if auto is None:
            return None
        with self._uia_lock:
            name = self._normalize_contact_name((getattr(item, "Name", "") or ""))
            
            if name in ("服务号", "订阅号", "Subscription Accounts", "订阅号消息", "公众号", "文件传输助手"):
                self._logger.info(f"跳过聚合类/特殊会话: {name}")
                return None
                
            try:
                # Use _click_control for robust clicking
                if self._click_control(item):
                    time.sleep(random.uniform(self._cfg.click_move_min_seconds, self._cfg.click_move_max_seconds))
                else:
                    # Fallback
                    item.Click(simulateMove=True)
                
                time.sleep(random.uniform(0.2, 0.5))
            except Exception:
                pass
            
            window = self.get_main_window()
            if self._check_and_exit_subscription_folder(window):
                return None

            current = self.get_current_chat_title(window) if window is not None else None
            current_name = self._normalize_contact_name(current or "")
            return current_name or name or None

    def ensure_chat_target(self, target: str) -> bool:
        if auto is None:
            return False
        with self._uia_lock:
            window = self.get_main_window()
            if window is None:
                return False

            target_name = self._normalize_contact_name(target)
            if target_name in ("服务号", "订阅号", "Subscription Accounts", "订阅号消息", "公众号", "文件传输助手"):
                self._logger.info(f"拒绝向聚合类/特殊会话发送消息: {target_name}")
                return False
                
            current = self.get_current_chat_title(window)
            current_name = self._normalize_contact_name(current or "")
            
            if current_name and target_name and target_name in current_name:
                return True

            session_list = self._locate_session_list(window)
            if session_list is None:
                return False

            best = None
            children = session_list.GetChildren() or []
            for item in children:
                raw_name = getattr(item, "Name", "") or ""
                name_lines = raw_name.split('\n')
                name = name_lines[0].strip() if name_lines else ""
                name = self._normalize_contact_name(name)
                
                if not name:
                    continue
                
                if target_name == name or (target_name and target_name in name):
                    best = item
                    break
            
            if best is None:
                return False
                
            self.click_session_item(best)
            time.sleep(random.uniform(0.5, 1.0))
            
            current = self.get_current_chat_title(window)
            current_name = self._normalize_contact_name(current or "")
            return bool(current_name and target_name and target_name in current_name)

    def get_current_chat_title(self, window: Any) -> Optional[str]:
        if auto is None or window is None:
            return None

        # 1. 缓存拦截
        if self._cached_chat_title_ctrl:
            try:
                if self._cached_chat_title_ctrl.Exists(0, 0):
                    name = (getattr(self._cached_chat_title_ctrl, "Name", "") or "").strip()
                    if not self._is_invalid_chat_title_candidate(name):
                        normalized_name = self._normalize_contact_name(name)
                        if normalized_name:
                            return normalized_name
            except Exception:
                pass
            self._cached_chat_title_ctrl = None

        try:
            # 新版微信标题控件的 AutomationId 以 current_chat_name_label 结尾。
            title_ctrl = self._find_descendant_by_automation_id(
                window,
                ["current_chat_name_label"],
                max_depth=24,
                control_type="TextControl",
            )
            if title_ctrl is not None:
                name = (getattr(title_ctrl, "Name", "") or "").strip()
                if not self._is_invalid_chat_title_candidate(name):
                    normalized_name = self._normalize_contact_name(name)
                    if normalized_name:
                        self._cached_chat_title_ctrl = title_ctrl
                        self._logger.info(f"通过新版标题控件锁定当前聊天窗口标题: {normalized_name}")
                        return normalized_name

            msg_list = self._locate_message_list(window)
            msg_bbox = utils.rect_to_bbox(getattr(msg_list, "BoundingRectangle", None)) if msg_list else None

            info_btn = auto.ButtonControl(searchFromControl=window, searchDepth=20, Name="聊天信息")
            if info_btn and info_btn.Exists(0, 0):
                info_bbox = utils.rect_to_bbox(getattr(info_btn, "BoundingRectangle", None))
                if info_bbox:
                    info_left, info_top, _, info_bottom = info_bbox
                    anchor_top = info_top - 18
                    anchor_bottom = info_bottom + 18
                    anchor_left_limit = (msg_bbox[0] + 8) if msg_bbox else 500
                    anchor_right_limit = info_left + 6

                    anchor_candidates = []
                    for ctrl in _iter_descendants(window, max_depth=18):
                        try:
                            ctype = _control_type_name(ctrl)
                            if ctype not in ("TextControl", "ButtonControl"):
                                continue
                            name = (getattr(ctrl, "Name", "") or "").strip()
                            if not name:
                                continue
                            if self._is_invalid_chat_title_candidate(name):
                                continue
                            if re.search(r"20\d{2}年\d{1,2}月\d{1,2}日", name):
                                continue
                            if re.match(r"^([上下]午)?\s*\d{1,2}:\d{2}(?::\d{2})?$", name):
                                continue
                            if re.fullmatch(r"\d{1,2}:\d{2}(:\d{2})?", name):
                                continue
                            if name.isdigit():
                                continue
                            cbox = utils.rect_to_bbox(getattr(ctrl, "BoundingRectangle", None))
                            if not cbox:
                                continue
                            cl, ct, cr, cb = cbox
                            if ct < 0 or cb < 0:
                                continue
                            if cl < anchor_left_limit or cr > anchor_right_limit:
                                continue
                            if cb < anchor_top or ct > anchor_bottom:
                                continue
                            if cb - ct > 50:
                                continue
                            anchor_candidates.append((abs(ct - info_top), abs(cr - info_left), ct, cl, name, ctrl))
                        except Exception:
                            pass
                    if anchor_candidates:
                        anchor_candidates.sort(key=lambda x: (x[0], x[1], x[2], x[3]))
                        best_name = self._normalize_contact_name(anchor_candidates[0][4])
                        if not best_name:
                            return None
                        best_ctrl = anchor_candidates[0][5]
                        self._cached_chat_title_ctrl = best_ctrl
                        self._logger.info(f"成功通过聊天信息锚点锁定当前聊天窗口标题: {best_name}")
                        return best_name

            if msg_bbox:
                msg_left, msg_top, _, _ = msg_bbox
                header_top = msg_top - 110
                header_bottom = msg_top + 5
                candidates = []
                for ctrl in _iter_descendants(window, max_depth=18):
                    try:
                        ctype = _control_type_name(ctrl)
                        if ctype not in ("TextControl", "ButtonControl"):
                            continue
                        name = (getattr(ctrl, "Name", "") or "").strip()
                        if not name:
                            continue
                        if self._is_invalid_chat_title_candidate(name):
                            continue
                        if re.search(r"20\d{2}年\d{1,2}月\d{1,2}日", name):
                            continue
                        if re.match(r"^([上下]午)?\s*\d{1,2}:\d{2}(?::\d{2})?$", name):
                            continue
                        if re.fullmatch(r"\d{1,2}:\d{2}(:\d{2})?", name):
                            continue
                        if name.isdigit():
                            continue
                        cbox = utils.rect_to_bbox(getattr(ctrl, "BoundingRectangle", None))
                        if not cbox:
                            continue
                        cl, ct, cr, cb = cbox
                        if ct < 0 or cb < 0:
                            continue
                        if cl < msg_left + 8:
                            continue
                        if ct < header_top or cb > header_bottom:
                            continue
                        if cb - ct > 50:
                            continue
                        candidates.append((abs(ct - (msg_top - 44)), cl, name, ctrl))
                    except Exception:
                        pass
                if candidates:
                    candidates.sort(key=lambda x: (x[0], x[1]))
                    best_name = self._normalize_contact_name(candidates[0][2])
                    if not best_name:
                        return None
                    best_ctrl = candidates[0][3]
                    self._cached_chat_title_ctrl = best_ctrl
                    self._logger.info(f"成功通过标题区域锁定当前聊天窗口标题: {best_name}")
                    return best_name
        except Exception as e:
            self._logger.warning(f"获取当前聊天标题异常: {e}")

        return None

    def _get_content_root(self, window: Any) -> Any:
        root = window
        try:
            for child in window.GetChildren() or []:
                name = getattr(child, "Name", "")
                cls = getattr(child, "ClassName", "")
                if cls == "MMUIRenderSubWindowHW" or name == "MMUIRenderSubWindowHW":
                    return child
        except Exception:
            pass
        return root

    def find_input_box(self, window: Any) -> Optional[Any]:
        if auto is None:
            return None
        
        # 1. 优先使用缓存
        if self._cached_input_box and self._cached_input_box.Exists(0, 0):
            return self._cached_input_box

        # 2. 新版微信输入框有稳定 AutomationId=chat_input_field。
        edit = self._find_descendant_by_automation_id(
            window,
            ["chat_input_field"],
            max_depth=24,
            control_type="EditControl",
        )
        if edit is not None:
            self._cached_input_box = edit
            return edit
              
        # 3. 策略：根据当前聊天标题查找 (EditControl Name通常等于聊天标题)
        current_title = self.get_current_chat_title(window)
        if current_title:
            try:
                # 限制搜索范围在右侧面板，或者全局搜索但检查位置
                # 增加深度以确保能找到
                edit = auto.EditControl(searchFromControl=window, searchDepth=20, Name=current_title)
                if edit and edit.Exists(0, 0):
                    # 校验位置：必须在右侧 (Left > 300) 且有一定宽度
                    rect = getattr(edit, "BoundingRectangle", None)
                    bbox = utils.rect_to_bbox(rect)
                    if bbox:
                        w = bbox[2] - bbox[0]
                        if bbox[0] > 300 and w > 300:
                            self._cached_input_box = edit
                            return edit
            except Exception:
                pass

        # 4. 策略：从右侧主面板向下查找 (最可靠)
        msg_list = self._locate_message_list(window)
        if msg_list:
            try:
                # msg_list -> chat_body -> right_main
                # 根据控件树结构，需要往上找几层
                p1 = msg_list.GetParentControl()
                if p1:
                    p2 = p1.GetParentControl() # right_main or container
                    if p2:
                        # 在右侧大容器里找 EditControl
                        # 通常输入框在底部，且尺寸较大
                        edits = p2.GetChildren() # 这里不能直接GetChildren，需要DeepSearch
                        # 使用 auto.EditControl 搜索
                        # 深度设为 10 应该足够
                        edit = auto.EditControl(searchFromControl=p2, searchDepth=12)
                        
                        # 可能找到搜索框(Name='搜索')，需要排除
                        # 搜索框通常在顶部，输入框在底部
                        # 如果找到多个，需要遍历筛选
                        
                        candidates = []
                        # 手动遍历 p2 下的 EditControl
                        for ctrl in _iter_descendants(p2, max_depth=12):
                            if _control_type_name(ctrl) == "EditControl":
                                rect = getattr(ctrl, "BoundingRectangle", None)
                                bbox = utils.rect_to_bbox(rect)
                                if bbox:
                                    w = bbox[2] - bbox[0]
                                    h = bbox[3] - bbox[1]
                                    t = bbox[1]
                                    # 排除搜索框 (通常高度较小 < 30 或 宽度较小 < 200，且位置靠上)
                                    if w > 300 and h > 40:
                                        candidates.append((t, ctrl))
                        
                        if candidates:
                            # 取 Top 最大的 (最下面的)
                            candidates.sort(key=lambda x: x[0], reverse=True)
                            best = candidates[0][1]
                            self._cached_input_box = best
                            return best
            except Exception:
                pass

        # 5. 策略：启发式查找 (全局遍历，位置+尺寸)
        try:
            candidates = []
            for ctrl in _iter_descendants(window, max_depth=20):
                if _control_type_name(ctrl) == "EditControl":
                    rect = getattr(ctrl, "BoundingRectangle", None)
                    bbox = utils.rect_to_bbox(rect)
                    if bbox:
                        l, t, r, b = bbox
                        w = r - l
                        h = b - t
                        # 输入框特征：右侧，宽大
                        if l > 350 and w > 300 and h > 40:
                            candidates.append((t, ctrl))
            
            if candidates:
                candidates.sort(key=lambda x: x[0], reverse=True)
                best = candidates[0][1]
                self._cached_input_box = best
                return best
        except Exception:
            pass
            
        # 6. 旧策略：查找 Name="输入" (兜底)
        try:
            edit = auto.EditControl(searchFromControl=window, searchDepth=15, Name="输入")
            if edit and edit.Exists(0, 0):
                self._cached_input_box = edit
                return edit
        except Exception:
            pass

        return None

    def find_send_button(self, window: Any) -> Optional[Any]:
        if auto is None:
            return None
             
        # 0. 新版微信发送按钮位于 mmui::ChatInputSendView 内，类名为 mmui::XOutlineButton。
        try:
            candidates = []
            for ctrl in _iter_descendants(window, max_depth=20):
                if _control_type_name(ctrl) != "ButtonControl":
                    continue
                if _safe_attr(ctrl, "ClassName") != "mmui::XOutlineButton":
                    continue
                text = (_safe_attr(ctrl, "Name") or "").strip()
                if text and text != "发送":
                    continue
                rect = getattr(ctrl, "BoundingRectangle", None)
                b = utils.rect_to_bbox(rect)
                if b is None:
                    continue
                candidates.append((b[1], b[0], ctrl))
            if candidates:
                candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
                return candidates[0][2]
        except Exception:
            pass

        # 1. 策略：基于输入框的相对位置查找 (最稳)
        if self._cached_input_box:
            try:
                # 发送按钮通常是输入框的兄弟或叔叔节点，且位置在输入框下方
                p1 = self._cached_input_box.GetParentControl()
                if p1:
                    # 尝试在父节点找
                    btn = auto.ButtonControl(searchFromControl=p1, searchDepth=5, Name="发送(S)")
                    if btn.Exists(0, 0): return btn
                    
                    # 尝试在爷爷节点找
                    p2 = p1.GetParentControl()
                    if p2:
                        btn = auto.ButtonControl(searchFromControl=p2, searchDepth=8, Name="发送(S)")
                        if btn.Exists(0, 0): return btn
            except Exception:
                pass

        roots = []
        content_root = self._get_content_root(window)
        roots.append(content_root)
        if content_root != window:
            roots.append(window)

        try:
            # Strategy 1: Name="发送(S)" or "发送"
            for root in roots:
                for name in ("发送(S)", "发送"):
                    btn = auto.ButtonControl(searchFromControl=root, searchDepth=25, Name=name)
                    if btn and btn.Exists(0, 0):
                        return btn

            # Strategy 2: Fallback (Lowest button with '发送' in name)
            for root in roots:
                candidates = []
                for ctrl in _iter_descendants(root, max_depth=25):
                    if _control_type_name(ctrl) != "ButtonControl":
                        continue
                    text = (getattr(ctrl, "Name", "") or "")
                    if "发送" not in text:
                        continue
                    rect = getattr(ctrl, "BoundingRectangle", None)
                    b = utils.rect_to_bbox(rect)
                    if b is None:
                        continue
                    candidates.append((b[3], ctrl))
                if candidates:
                    candidates.sort(key=lambda x: x[0])
                    return candidates[-1][1]
        except Exception:
            pass
        return None

    def _is_wechat_self_bubble_pixel(self, red: int, green: int, blue: int) -> bool:
        """识别新版微信自己发送消息使用的绿色气泡像素。"""
        return green >= 120 and 70 <= red <= 230 and 70 <= blue <= 230 and green - red >= 20 and green - blue >= 20

    def _classify_message_direction_by_bubble_pixels(
        self,
        image: Any,
        item_bbox: Tuple[int, int, int, int],
        list_bbox: Tuple[int, int, int, int],
    ) -> str:
        """根据消息行截图中的绿色气泡位置判断消息方向。"""
        if image is None or item_bbox is None or list_bbox is None:
            return "unknown"

        try:
            width, height = image.size
        except Exception:
            return "unknown"
        if width <= 0 or height <= 0:
            return "unknown"

        list_center_x = (list_bbox[0] + list_bbox[2]) / 2.0
        right_green = 0
        left_green = 0
        total_green = 0
        min_green_x = None
        max_green_x = None
        sum_green_x = 0
        self._last_direction_pixel_stats = {"left": 0, "right": 0, "total": 0}
        sample_step = 2

        try:
            rgb_image = image.convert("RGB")
            for y in range(0, height, sample_step):
                for x in range(0, width, sample_step):
                    red, green, blue = rgb_image.getpixel((x, y))
                    if not self._is_wechat_self_bubble_pixel(red, green, blue):
                        continue
                    total_green += 1
                    absolute_x = item_bbox[0] + x
                    sum_green_x += absolute_x
                    min_green_x = absolute_x if min_green_x is None else min(min_green_x, absolute_x)
                    max_green_x = absolute_x if max_green_x is None else max(max_green_x, absolute_x)
                    if absolute_x >= list_center_x:
                        right_green += 1
                    else:
                        left_green += 1
        except Exception:
            return "unknown"

        green_center_x = (sum_green_x / total_green) if total_green else 0
        self._last_direction_pixel_stats = {
            "left": left_green,
            "right": right_green,
            "total": total_green,
            "min_x": int(min_green_x or 0),
            "max_x": int(max_green_x or 0),
            "center_x": int(green_center_x),
        }
        if total_green < 20:
            return "unknown"
        if right_green >= 100 and right_green > left_green * 1.15:
            return "self"
        # 长文本的自己气泡会从右侧向左延展并跨过列表中线，不能只按左右绿色像素数量判定。
        if (
            right_green >= 100
            and max_green_x is not None
            and max_green_x >= list_center_x + 20
            and green_center_x >= list_center_x - 120
        ):
            return "self"
        if left_green >= 100 and left_green > right_green * 1.15:
            return "other"
        return "unknown"

    def _is_message_item_visible_enough(
        self,
        item_bbox: Tuple[int, int, int, int],
        list_bbox: Tuple[int, int, int, int],
    ) -> bool:
        """过滤已经大部分滑出消息列表可视区域的消息项。"""
        if item_bbox is None or list_bbox is None:
            return False
        item_height = max(1, item_bbox[3] - item_bbox[1])
        visible_top = max(item_bbox[1], list_bbox[1])
        visible_bottom = min(item_bbox[3], list_bbox[3])
        visible_height = max(0, visible_bottom - visible_top)
        return (visible_height / item_height) >= 0.6

    def _analyze_item_alignment(self, item: Any, list_bbox: Tuple[int, int, int, int]) -> str:
        if item is None or list_bbox is None:
            return "other"
            
        try:
            # 列表中心线
            list_center_x = (list_bbox[0] + list_bbox[2]) / 2.0
            
            # 遍历 ListItem 的子孙节点，寻找头像 Button
            for ctrl in _iter_descendants(item, max_depth=4):
                if _control_type_name(ctrl) == "ButtonControl":
                    rect = getattr(ctrl, "BoundingRectangle", None)
                    if rect:
                        width = rect.right - rect.left
                        height = rect.bottom - rect.top
                        # 头像通常是正方形按钮，尺寸在 30 到 50 之间
                        if 30 <= width <= 50 and 30 <= height <= 50:
                            btn_center_x = (rect.left + rect.right) / 2.0
                            if btn_center_x > list_center_x:
                                return "self"
                            else:
                                return "other"
                                
        except Exception:
            pass

        try:
            item_bbox = utils.rect_to_bbox(getattr(item, "BoundingRectangle", None))
            if item_bbox and ImageGrab is not None:
                image = ImageGrab.grab(bbox=item_bbox)
                direction = self._classify_message_direction_by_bubble_pixels(image, item_bbox, list_bbox)
                self._logger.info(
                    "消息方向判定: direction=%s, green_left=%s, green_right=%s, green_total=%s, 文本=%s, item_bbox=%s, list_bbox=%s",
                    direction,
                    self._last_direction_pixel_stats.get("left", 0),
                    self._last_direction_pixel_stats.get("right", 0),
                    self._last_direction_pixel_stats.get("total", 0),
                    (_safe_attr(item, "Name") or "")[:40],
                    item_bbox,
                    list_bbox,
                )
                if direction in ("self", "other"):
                    return direction
        except Exception as e:
            self._logger.debug("消息方向颜色判定失败: %s", e)

        return "other"

    def extract_latest_messages(self, contact_hint: str) -> List[Dict[str, Any]]:
        if auto is None: return []
        with self._uia_lock:
            window = self.get_main_window()
            if window is None: return []

            # 新版微信不再暴露消息气泡子控件，只能通过可见气泡颜色判断方向；
            # 因此提取前先激活微信窗口，避免被助手窗口遮挡导致截图拿到其它窗口内容。
            try:
                window.ShowWindow(auto.SW.Restore)
            except Exception:
                pass
            try:
                window.SetActive()
            except Exception:
                pass
            time.sleep(0.08)
            
            normalized_contact = self._normalize_contact_name(contact_hint)
            if not normalized_contact:
                current_title = self.get_current_chat_title(window)
                if not current_title:
                    return [] # 拿不到标题直接退出
                normalized_contact = self._normalize_contact_name(current_title)
                
            msg_list = self._locate_message_list(window)
            if msg_list is None: return []
            
            list_bbox = utils.rect_to_bbox(getattr(msg_list, "BoundingRectangle", None))
            if not list_bbox: return []

            items = msg_list.GetChildren() or []
            if not items: return []

            collected_messages = []
            scan_limit = max(5, int(self._cfg.message_scan_limit))
            scan_items = items[-scan_limit:]
            self._logger.info("开始提取最新消息: 会话=%s, 总节点=%d, 扫描节点=%d", normalized_contact, len(items), len(scan_items))

            for item in scan_items:
                item_bbox = utils.rect_to_bbox(getattr(item, "BoundingRectangle", None))
                if item_bbox and not self._is_message_item_visible_enough(item_bbox, list_bbox):
                    self._logger.info(
                        "跳过可视区域不足的消息项: 文本=%s, item_bbox=%s, list_bbox=%s",
                        (_safe_attr(item, "Name") or "")[:40],
                        item_bbox,
                        list_bbox,
                    )
                    continue
                msg = self._extract_message_from_item(normalized_contact or contact_hint, item)
                if not msg: continue 

                direction = self._analyze_item_alignment(item, list_bbox)
                msg['is_self'] = (direction == "self")
                collected_messages.append(msg)
            
            if collected_messages:
                self._logger.info("提取消息完成: 会话=%s, 有效消息=%d", normalized_contact, len(collected_messages))
                last_msg = collected_messages[-1]
                if not last_msg.get('is_self', False):
                    last_msg['trigger_reply'] = True
            else:
                sample_names = [((getattr(node, "Name", "") or "").strip())[:40] for node in scan_items]
                self._logger.warning("提取消息为空: 会话=%s, 最近节点样本=%s", normalized_contact, sample_names)
            
            return collected_messages

    def _extract_message_from_item(self, contact_hint: str, item: Any) -> Optional[Dict[str, Any]]:
        try:
            ui_id = item.GetRuntimeId()
        except:
            ui_id = None

        raw_name = (getattr(item, "Name", "") or "").strip()
        if not raw_name:
            return None
        
        # 1. 排除时间戳
        if self._is_time_separator_text(raw_name):
            return None
        
        # 2. 排除系统提示
        if self._is_new_message_divider(raw_name):
            self._logger.info("消息过滤-新消息分隔提示: %s", raw_name[:80])
            return None
        if raw_name in ("查看更多消息", "如果你要查看更多消息"):
            self._logger.info("消息过滤-历史消息入口: %s", raw_name)
            return None
        if ("你已添加了" in raw_name and "现在可以开始聊天了" in raw_name) or "以上是打招呼的内容" in raw_name:
            self._logger.info("消息过滤-打招呼系统提示: %s", raw_name[:80])
            return None
        
        # 排除撤回消息 (系统通知，非用户发言)
        if "撤回了一条消息" in raw_name:
            # 进一步确认是否为系统消息（系统消息没有头像按钮）
            is_system = True
            if auto:
                try:
                    # 正常消息ListItem下会有ButtonControl(头像)
                    # 结构通常为: ListItem -> Pane -> Button
                    btn = auto.ButtonControl(searchFromControl=item, searchDepth=4)
                    if btn.Exists(0, 0):
                        is_system = False
                except Exception:
                    pass
            
            if is_system:
                self._logger.info("消息过滤-撤回系统提示: %s", raw_name[:80])
                return None

        text_content = raw_name
        
        # 3. 极速提取富文本卡片 (视频号/小程序/链接等)
        # 不再使用 Python 遍历，改用 UIA 底层 C++ 搜索寻找附带文字
        if raw_name.startswith("[") and raw_name.endswith("]"):
            try:
                # 限制深度为 8，瞬间找出卡片里带的文本（比如：AI-魔方视界）
                text_ctrl = auto.TextControl(searchFromControl=item, searchDepth=8)
                if text_ctrl and text_ctrl.Exists(0, 0):
                    found_text = (text_ctrl.Name or "").strip()
                    if found_text and found_text != raw_name:
                        text_content = f"{raw_name} {found_text}"
            except Exception:
                pass

        if text_content:
             return {"contact": contact_hint, "type": "text", "content": text_content, "timestamp": utils.now_iso(), "ui_id": ui_id}
        
        return None

    def copy_image_message(self, target: str, message_ui_id: Any = None, timestamp: Any = None) -> Dict[str, Any]:
        if auto is None:
            return {"ok": False, "error": "uia_unavailable", "message": "UIA 未加载，无法复制微信图片"}

        with self._uia_lock:
            if not self.ensure_chat_target(target):
                self._logger.warning("复制微信图片失败：无法切换到目标会话 %s", target)
                return {"ok": False, "error": "target_not_found", "message": "无法切换到目标会话"}

            window = self.get_main_window()
            if window is None:
                return {"ok": False, "error": "wechat_window_not_found", "message": "未找到微信窗口"}

            message_list = self._locate_message_list(window)
            if message_list is None:
                return {"ok": False, "error": "message_list_not_found", "message": "未找到微信消息列表"}

            image_item = self._find_image_message_item(message_list, message_ui_id)
            if image_item is None:
                self._logger.warning("复制微信图片失败：未找到图片消息 target=%s ui_id=%s timestamp=%s", target, message_ui_id, timestamp)
                return {"ok": False, "error": "image_message_not_found", "message": "未找到图片消息"}

            self._logger.info(
                "准备复制微信图片消息 target=%s ui_id=%s item=%s children=%s",
                target,
                message_ui_id,
                self._brief_control(image_item),
                self._summarize_control_children(image_item),
            )
            # 先在任何复制/右键动作前截取可见图片，避免微信控件刷新后边界变成 0。
            fallback_data_url = self._capture_visible_image_message(image_item)
            if fallback_data_url:
                self._logger.info("已预先截取微信图片可见区域 dataUrlLength=%d", len(fallback_data_url))
            copy_result = self._copy_control_to_clipboard(image_item)
            if copy_result.get("ok"):
                self._logger.info(
                    "复制微信图片消息成功 target=%s ui_id=%s strategy=%s",
                    target,
                    message_ui_id,
                    copy_result.get("strategy"),
                )
                result = {"ok": True, "strategy": copy_result.get("strategy"), "attempts": copy_result.get("attempts", [])}
                if copy_result.get("dataUrl"):
                    result["dataUrl"] = copy_result.get("dataUrl")
                return result

            self._logger.warning(
                "复制微信图片失败：所有复制策略均未在剪贴板检测到图片 target=%s ui_id=%s attempts=%s",
                target,
                message_ui_id,
                copy_result.get("attempts", []),
            )
            if fallback_data_url:
                self._logger.info(
                    "复制微信图片失败后启用截图兜底 target=%s ui_id=%s dataUrlLength=%d",
                    target,
                    message_ui_id,
                    len(fallback_data_url),
                )
                return {
                    "ok": True,
                    "strategy": "screenshot_fallback",
                    "attempts": [
                        {"strategy": "pre_capture_visible_message", "clipboard": "screenshot_ready"},
                        *copy_result.get("attempts", []),
                    ],
                    "dataUrl": fallback_data_url,
                }
            return {
                "ok": False,
                "error": "copy_failed",
                "message": "图片气泡复制后剪贴板未出现图片",
                "attempts": copy_result.get("attempts", []),
            }

    def _find_image_message_item(self, message_list: Any, message_ui_id: Any = None) -> Optional[Any]:
        try:
            children = message_list.GetChildren() or []
        except Exception:
            return None

        expected_runtime_id = self._normalize_runtime_id(message_ui_id)
        if expected_runtime_id:
            for item in reversed(children):
                try:
                    if self._normalize_runtime_id(item.GetRuntimeId()) == expected_runtime_id:
                        return item
                except Exception:
                    continue

        for item in reversed(children[-30:]):
            raw_name = (getattr(item, "Name", "") or "").strip()
            if self._is_image_placeholder_text(raw_name):
                return item
        return None

    def _normalize_runtime_id(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, (list, tuple)):
            return "|".join(str(item) for item in value)
        return str(value).strip()

    def _is_image_placeholder_text(self, text: str) -> bool:
        normalized = re.sub(r"\s+", "", text or "").strip()
        if not normalized:
            return False
        image_words = ("图片", "Image", "Photo")
        if normalized in image_words:
            return True
        if normalized.startswith("[") and normalized.endswith("]"):
            return any(word in normalized for word in image_words)
        return False

    def _build_image_copy_targets(self, item: Any) -> List[Any]:
        targets: List[Any] = []
        for ctrl in _iter_descendants(item, max_depth=8):
            if self._is_image_copy_candidate(ctrl):
                targets.append(ctrl)
        targets.append(item)
        deduped: List[Any] = []
        seen = set()
        for target in targets:
            marker = id(target)
            if marker in seen:
                continue
            seen.add(marker)
            deduped.append(target)
        return deduped

    def _is_image_copy_candidate(self, ctrl: Any) -> bool:
        control_type = _control_type_name(ctrl)
        name = (getattr(ctrl, "Name", "") or "").strip()
        if control_type in ("ImageControl", "ButtonControl") and self._is_image_placeholder_text(name):
            return True
        if control_type == "ImageControl":
            return True
        if control_type == "ButtonControl" and name in ("查看图片", "打开图片", "图片", "Image", "Photo"):
            return True
        return False

    def _copy_control_to_clipboard(self, item: Any) -> Dict[str, Any]:
        attempts: List[Dict[str, str]] = []
        targets = self._build_image_copy_targets(item)
        self._logger.info("微信图片复制候选控件数量=%d candidates=%s", len(targets), [self._brief_control(target) for target in targets[:8]])

        for index, target in enumerate(targets):
            strategy = f"ctrl_c_candidate_{index}"
            try:
                self._focus_control_for_copy(target)
                time.sleep(0.15)
                auto.SendKeys("{Ctrl}c", waitTime=0.2)
                time.sleep(0.35)
                clipboard_image = self._read_clipboard_image_data_url()
                attempts.append({"strategy": strategy, "clipboard": clipboard_image["kind"], "target": self._brief_control(target)})
                if clipboard_image.get("dataUrl"):
                    self._close_image_preview_if_needed()
                    return {
                        "ok": True,
                        "strategy": strategy,
                        "attempts": attempts,
                        "dataUrl": clipboard_image.get("dataUrl"),
                    }
            except Exception as e:
                attempts.append({"strategy": strategy, "error": str(e), "target": self._brief_control(target)})
                self._logger.warning("快捷键复制微信图片失败 strategy=%s target=%s error=%s", strategy, self._brief_control(target), e)

            context_strategy = f"context_menu_candidate_{index}"
            try:
                if self._copy_with_context_menu(target):
                    time.sleep(0.35)
                    clipboard_image = self._read_clipboard_image_data_url()
                    attempts.append({"strategy": context_strategy, "clipboard": clipboard_image["kind"], "target": self._brief_control(target)})
                    if clipboard_image.get("dataUrl"):
                        self._close_image_preview_if_needed()
                        return {
                            "ok": True,
                            "strategy": context_strategy,
                            "attempts": attempts,
                            "dataUrl": clipboard_image.get("dataUrl"),
                        }
                else:
                    attempts.append({"strategy": context_strategy, "clipboard": "menu_not_found", "target": self._brief_control(target)})
            except Exception as e:
                attempts.append({"strategy": context_strategy, "error": str(e), "target": self._brief_control(target)})
                self._logger.warning("右键菜单复制微信图片失败 strategy=%s target=%s error=%s", context_strategy, self._brief_control(target), e)
                try:
                    auto.SendKeys("{Esc}", waitTime=0.1)
                except Exception:
                    pass

        return {"ok": False, "attempts": attempts}

    def _focus_control_for_copy(self, target: Any) -> None:
        try:
            target.SetFocus()
            return
        except Exception:
            pass
        try:
            parent = target.GetParentControl()
            if parent is not None:
                parent.SetFocus()
                return
        except Exception:
            pass
        self._logger.info("图片复制未能通过 SetFocus 聚焦控件，将直接发送复制快捷键 target=%s", self._brief_control(target))

    def _copy_with_context_menu(self, target: Any) -> bool:
        rect = getattr(target, "BoundingRectangle", None)
        bbox = utils.rect_to_bbox(rect)
        if not bbox:
            return False
        x = (bbox[0] + bbox[2]) // 2
        y = (bbox[1] + bbox[3]) // 2
        auto.RightClick(x, y)
        time.sleep(0.25)
        menu_item = None
        for name in ("复制", "Copy"):
            try:
                candidate = auto.MenuItemControl(Name=name)
                if candidate and candidate.Exists(0.5, 0.1):
                    menu_item = candidate
                    break
            except Exception:
                pass
        if menu_item is None:
            menu_item = self._find_named_clickable(self.get_main_window(), ["复制", "Copy"], search_depth=8)
        if menu_item is None:
            try:
                auto.SendKeys("{Esc}", waitTime=0.1)
            except Exception:
                pass
            return False
        self._click_control(menu_item)
        return True

    def _read_clipboard_image_data_url(self) -> Dict[str, Any]:
        if ImageGrab is None:
            return {"kind": "unknown_no_pillow"}
        try:
            content = ImageGrab.grabclipboard()
            if content is None:
                return {"kind": "empty"}
            if hasattr(content, "size") and hasattr(content, "mode"):
                return {"kind": "image", "dataUrl": self._pil_image_to_data_url(content)}
            if isinstance(content, list):
                image_path = self._pick_clipboard_image_file(content)
                if image_path:
                    return {"kind": "image_file", "dataUrl": self._image_file_to_data_url(image_path), "filePath": image_path}
                return {"kind": "file_list", "files": [str(item) for item in content[:5]]}
            return {"kind": type(content).__name__}
        except Exception as e:
            return {"kind": f"clipboard_error:{e}"}

    def _pick_clipboard_image_file(self, files: List[Any]) -> Optional[str]:
        for item in files:
            path = str(item)
            if not path.lower().endswith((".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp")):
                continue
            if os.path.exists(path) and os.path.isfile(path):
                return path
        return None

    def _image_file_to_data_url(self, image_path: str) -> Optional[str]:
        try:
            with open(image_path, "rb") as file:
                raw = file.read()
            if not raw:
                return None
            suffix = os.path.splitext(image_path)[1].lower()
            mime_type = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".gif": "image/gif",
                ".bmp": "image/bmp",
                ".webp": "image/webp",
            }.get(suffix, "image/png")
            data_url = f"data:{mime_type};base64," + base64.b64encode(raw).decode("ascii")
            self._logger.info("已从剪贴板图片文件读取图片 imagePath=%s dataUrlLength=%d", image_path, len(data_url))
            return data_url
        except Exception as e:
            self._logger.warning("读取剪贴板图片文件失败 imagePath=%s error=%s", image_path, e)
            return None

    def _pil_image_to_data_url(self, image: Any) -> Optional[str]:
        try:
            output = io.BytesIO()
            image.save(output, format="PNG")
            return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")
        except Exception as e:
            self._logger.warning("剪贴板图片转换失败: %s", e)
            return None

    def _close_image_preview_if_needed(self) -> None:
        try:
            auto.SendKeys("{Esc}", waitTime=0.05)
        except Exception:
            pass

    def _summarize_control_children(self, item: Any) -> List[str]:
        summary: List[str] = []
        for index, ctrl in enumerate(_iter_descendants(item, max_depth=4)):
            if index >= 20:
                summary.append("...")
                break
            summary.append(self._brief_control(ctrl))
        return summary

    def _capture_visible_image_message(self, item: Any) -> Optional[str]:
        if ImageGrab is None:
            self._logger.warning("截图兜底失败：Pillow ImageGrab 未加载")
            return None
        try:
            bbox = utils.rect_to_bbox(getattr(item, "BoundingRectangle", None))
            if not bbox:
                self._logger.warning("截图兜底失败：图片消息没有有效边界 item=%s", self._brief_control(item))
                return None
            left, top, right, bottom = bbox
            width = right - left
            height = bottom - top
            if width < 20 or height < 20:
                self._logger.warning("截图兜底失败：图片消息边界过小 bbox=%s item=%s", bbox, self._brief_control(item))
                return None
            image = ImageGrab.grab(bbox=bbox)
            cropped = self._crop_visible_message_image(image)
            output = io.BytesIO()
            cropped.save(output, format="PNG")
            data_url = "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")
            self._logger.info("截图兜底成功 bbox=%s cropSize=%s dataUrlLength=%d", bbox, getattr(cropped, "size", None), len(data_url))
            return data_url
        except Exception as e:
            self._logger.warning("截图兜底失败：%s", e)
            return None

    def _crop_visible_message_image(self, image: Any) -> Any:
        try:
            rgb_image = image.convert("RGB")
            width, height = rgb_image.size
            min_x, min_y = width, height
            max_x, max_y = -1, -1
            for y in range(height):
                for x in range(width):
                    red, green, blue = rgb_image.getpixel((x, y))
                    # 过滤微信聊天区常见的白色/浅灰背景，只保留图片、头像和气泡主体。
                    if red >= 238 and green >= 238 and blue >= 238:
                        continue
                    min_x = min(min_x, x)
                    min_y = min(min_y, y)
                    max_x = max(max_x, x)
                    max_y = max(max_y, y)
            if max_x < 0 or max_y < 0:
                return image
            padding = 6
            crop_box = (
                max(0, min_x - padding),
                max(0, min_y - padding),
                min(width, max_x + padding + 1),
                min(height, max_y + padding + 1),
            )
            cropped = image.crop(crop_box)
            if cropped.size[0] < 20 or cropped.size[1] < 20:
                return image
            return cropped
        except Exception:
            return image

    def _is_new_message_divider(self, text: str) -> bool:
        normalized = re.sub(r"\s+", "", text or "")
        if not normalized:
            return False
        normalized = normalized.strip("：:。.!！?？-—_~～·•|｜")
        return normalized in ("以下是新消息", "以下为新消息", "以下是最新消息", "以下为最新消息")

    def _is_time_separator_text(self, text: str) -> bool:
        normalized = re.sub(r"\s+", "", text or "")
        if not normalized:
            return False
        if re.fullmatch(r"\d{1,2}:\d{2}(:\d{2})?", normalized):
            return True
        if re.fullmatch(r"(今天|昨天)(\d{1,2}:\d{2}(:\d{2})?)?", normalized):
            return True
        if re.fullmatch(r"\d{1,2}月\d{1,2}日([上下]午)?\d{1,2}:\d{2}(:\d{2})?", normalized):
            return True
        if re.fullmatch(r"星期[一二三四五六日天]([上下]午)?\d{1,2}:\d{2}(:\d{2})?", normalized):
            return True
        if re.fullmatch(r"20\d{2}年\d{1,2}月\d{1,2}日([上下]午)?\d{1,2}:\d{2}(:\d{2})?", normalized):
            return True
        return False

    def set_text_and_send(self, target: str, text: str) -> bool:
        if auto is None:
            return False
        
        time.sleep(random.uniform(0.2, 0.6))

        with self._uia_lock:
            window = self.get_main_window()
            if window is None:
                return False
            
            try:
                window.SetActive()
            except:
                pass

            if not self.ensure_chat_target(target):
                self._logger.warning(f"无法切换到目标会话: {target}")
                return False

            edit = self.find_input_box(window)
            if edit is None:
                self._logger.warning("未找到输入框，无法发送消息")
                return False

            ok = self._set_edit_value(edit, text)
            if not ok:
                self._logger.warning("无法在输入框中粘贴文本")
                return False

            time.sleep(random.uniform(0.3, 0.8))

            send_btn = self.find_send_button(window)
            if send_btn is not None:
                try:
                    send_btn.Click(simulateMove=True)
                    return True
                except Exception:
                    pass

            # Fallback 1: Alt+S (Common shortcut for Send)
            try:
                auto.SendKeys("{Alt}s")
                return True
            except:
                pass

            # Fallback 2: Enter
            try:
                auto.SendKeys("{Enter}")
                return True
            except Exception:
                return False

    def _set_edit_value(self, edit: Any, text: str) -> bool:
        if pyperclip is None:
            self._logger.error("缺少 pyperclip 依赖")
            return False

        try:
            # Use _click_control for more robust clicking (center point)
            self._click_control(edit)
            time.sleep(0.2)
            edit.SendKeys("{Ctrl}a", waitTime=0.1) 
            edit.SendKeys("{Delete}", waitTime=0.1)
            pyperclip.copy(text)
            edit.SendKeys("{Ctrl}v", waitTime=0.2)
            time.sleep(0.1)
            return True
        except Exception as e:
            self._logger.error(f"输入文本异常: {e}")
            return False
