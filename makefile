MAKEFLAGS=-s --no-print-directory

.ONESHELL:
.DEFAULT: ; @:
.PHONY: help jwk github-push targets

# ═══════════════════════════════════════════════════════════════════
# 📋  Misc
# ═══════════════════════════════════════════════════════════════════

help:
	@printf '%s\n' \
		'jwk             Add GitHub remote (run once)' \
		'github-push     Push orphan snapshot to GitHub main' \
		'targets         List make target names only'

#
# targets - List make target names only
# ----------------------------------------
targets:
	@printf '%s\n' github-push help jwk targets

# 🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵 jwk 🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵🌵

#
# jwk - Add GitHub remote (run once)
# ------------------------------------
jwk:
	git remote add github git@github.com:wkaefer/emoji-multiply.git

# 🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀 github 🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀

#
# github-push - Push orphan snapshot to GitHub main
# --------------------------------------------------
github-push:
	git checkout --orphan github-staging
	git commit -m "Snapshot: $$(date +%Y-%m-%d)"
	git push --force github github-staging:main
	git checkout main
	git branch -D github-staging

# vim: set ft=make ts=8 sw=8 noet :
