from pathlib import Path
import unittest


STYLE = Path(__file__).resolve().parents[1] / "css" / "style.css"


def _block(css: str, marker: str, end_marker: str) -> str:
    start = css.index(marker)
    end = css.index(end_marker, start)
    return css[start:end]


class MotionCssTest(unittest.TestCase):
    def test_large_page_switch_animation_is_retained(self):
        css = STYLE.read_text(encoding="utf-8")
        page_enter_rule = _block(css, ".page.page-enter {", ".page.page-exit {")
        page_exit_rule = _block(css, ".page.page-exit {\n  position:", "@keyframes pageEnter")

        self.assertIn("animation: pageEnter", page_enter_rule)
        self.assertIn("animation: pageExit", page_exit_rule)

    def test_page_enter_animation_does_not_blur_content(self):
        css = STYLE.read_text(encoding="utf-8")
        page_enter = _block(css, "@keyframes pageEnter", "@keyframes pageExit")

        self.assertNotIn("blur(", page_enter)

    def test_reveal_items_are_static_for_small_content_updates(self):
        css = STYLE.read_text(encoding="utf-8")
        reveal_item = _block(css, ".reveal-item {", ".reveal-item.is-visible")
        reveal_visible = _block(css, ".reveal-item.is-visible", "@media (max-width: 1040px)")

        self.assertNotIn("blur(", reveal_item)
        self.assertNotIn("filter", reveal_item)
        self.assertNotIn("filter", reveal_visible)
        self.assertNotIn("opacity: 0", reveal_item)
        self.assertNotIn("translateY", reveal_item)
        self.assertNotIn("scale(", reveal_item)
        self.assertNotIn("transition", reveal_item)
        self.assertIn("opacity: 1", reveal_item)
        self.assertIn("transform: none", reveal_item)
        self.assertIn("opacity: 1", reveal_visible)
        self.assertIn("transform: none", reveal_visible)

    def test_recite_card_switch_does_not_use_deck_animation(self):
        css = STYLE.read_text(encoding="utf-8")

        self.assertNotIn("reader-list.single.deck-next", css)
        self.assertNotIn("reader-list.single.deck-prev", css)
        self.assertNotIn("deckInFromBottom", css)
        self.assertNotIn("deckInFromTop", css)

    def test_only_large_page_switch_uses_css_animation(self):
        css = STYLE.read_text(encoding="utf-8")
        animation_lines = [line.strip() for line in css.splitlines() if line.strip().startswith("animation:")]

        self.assertEqual(
            [
                "animation: pageEnter 440ms var(--ease-spring) both;",
                "animation: pageExit 260ms ease both;",
            ],
            animation_lines,
        )
        self.assertNotIn("@keyframes slideDown", css)
        self.assertNotIn("@keyframes hotspotPulse", css)


if __name__ == "__main__":
    unittest.main()
