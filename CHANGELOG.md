# Changelog

## [1.2.1](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/compare/v1.2.0...v1.2.1) (2026-06-05)


### Bug Fixes

* **a11y:** accessibility sprint — close all ten open findings ([ed0d06b](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/ed0d06ba0fdc3fc0545d11bd5f3fa7e62d428b69))
* **a11y:** app.js and app.html accessibility sprint fixes (A-1–A-6, AA-2) ([c7e34d3](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/c7e34d3c494a510b6245c21beb5cbf330c4e5824))
* **a11y:** popup focus ring double-ring and url-display contrast (AAA-3, AAA-1) ([4f038dc](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/4f038dc897918f5520a1b0431781ac744360c043))
* **a11y:** resolve all ten open baseline accessibility findings ([ed0d06b](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/ed0d06ba0fdc3fc0545d11bd5f3fa7e62d428b69))
* correct inline contrast-ratio annotations in popup.html ([ac56f68](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/ac56f68aff3b5081e63dccc0c1fcd0eca598009c))
* correct inline contrast-ratio annotations in popup.html ([ac56f68](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/ac56f68aff3b5081e63dccc0c1fcd0eca598009c))
* correct inline contrast-ratio annotations in popup.html ([620bbf0](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/620bbf0d6c93d73e0259888ba6963fc8dae43e4b))

## [1.2.0](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/compare/v1.1.4...v1.2.0) (2026-05-31)


### Features

* **contrast:** raise overall verdict threshold to WCAG 2.2 AAA (Q60A) ([7d54cb7](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/7d54cb7eb1fc0be79ee798c307d7f9051c272768))
* **scripts:** add next-q.sh for session Q-number display ([932ad8a](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/932ad8a43357776013d1b5ec7f0d01e7002fefb3))
* **scripts:** add next-q.sh so session-start displays the next Q-number ([fdfcd14](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/fdfcd14da301abc7e1ab3fad96c0509ae1dbf879))


### Bug Fixes

* **a11y:** add &lt;main&gt; landmark to popup (WCAG 2.4.1, SC 1.3.6) ([2f366cf](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/2f366cfd0262472dc996797f6cc3cb09ccb98954))
* **a11y:** add popup main landmark and raise fieldset border contrast ([534af90](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/534af907b8525ad552b2d4484627d6d545f00490))
* **a11y:** add popup main landmark and raise fieldset border contrast ([534af90](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/534af907b8525ad552b2d4484627d6d545f00490))
* **a11y:** fix focus ring contrast and popup min-width (Carol AAA-3, AA-3) ([c3d1713](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/c3d171300eb2bf17597d3a907978fc3987a080f6))
* **a11y:** fix report page contrast and aria-busy on feed ([57a4cd9](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/57a4cd9a01015b5362d63408a52dbc8862c156cf))
* **a11y:** raise "coming soon" label contrast to WCAG 2.2 AAA ([#595959](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/issues/595959)) ([81d9351](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/81d935151f81578d045b18df135659a89d31487c))
* **a11y:** raise fieldset border contrast to 4.54:1 (WCAG SC 1.4.11) ([bd080ba](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/bd080ba0e199e6620e389035264911f77a083b42))
* **a11y:** raise popup error and version text contrast to WCAG 2.2 AAA ([5c07f48](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/5c07f48adad3f5c8c6b0f8325dce144072eaef53))
* **ci:** allow empty CSS input in Stylelint and add title to sandbox ([c57cf62](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/c57cf6215729c67ba10c5cad6b96c5238399a9ba))
* **deps:** upgrade copy-webpack-plugin to v14 to fix serialize-javascript CVEs ([c8cb79d](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/c8cb79d07264f52c2b1aa12df42a8a349ed5ed85))
* LinkedIn-only badge label and coming-soon contrast to AAA ([678d616](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/678d616eb915b7991097646c35c0b60e771e4e89))
* LinkedIn-only badge label and coming-soon contrast to AAA ([678d616](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/678d616eb915b7991097646c35c0b60e771e4e89))
* **report:** display "LinkedIn only" platform label per ADR-008 (Q59C) ([1aebcf4](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/1aebcf474cc2fa3d7c32a5c83cc6c948dd0923f9))
* **security:** harden postMessage origin validation in sandbox and app ([b793c33](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/b793c33791dd919d4e97e25ebd741be2eb972bdd))
* **security:** move nosemgrep suppressions to flagged lines ([f57bfc0](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/f57bfc0f2a9c353b07422c1a3deae2b9da1821a2))
* **security:** narrow web_accessible_resources to LinkedIn hosts ([1d33d28](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/1d33d28d459605633bf7916aa6e3da58e1fe83b8))
* **security:** patch pre-tool-use.sh — six safety-hook vulnerabilities ([119cafb](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/119cafb0d65f37fcb6238775ad83c501b713c27f))
* **security:** patch pre-tool-use.sh — six safety-hook vulnerabilities ([71b5828](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/71b5828446f39b7e7c21da0a9b4f895c4a05e7ba))
* **tests:** increase Playwright service worker timeout for CI ([ccd4df3](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/ccd4df323ac6ae1439578fcc3f643e11f346411c))
* **tests:** use headless=new + xvfb-run to enable extension service workers in CI ([e04009e](https://github.com/timdixon82/Social-Media-Accessibility-Checker-Extension/commit/e04009e3e5d25ff8a638eeeb6390285b92c0276a))
