#!/bin/bash
set -euo pipefail

aqua install --only-link

if ! grep -q "bun-completion.bash" ~/.bashrc; then
  mkdir -p ~/.local/share/bun-completion
  SHELL=bash bun completions > ~/.local/share/bun-completion/bun.bash
  {
    echo ''
    echo '# bun-completion.bash'
    echo '[ -f ~/.local/share/bun-completion/bun.bash ] && . ~/.local/share/bun-completion/bun.bash'
  } >> ~/.bashrc
fi


curl -fsSL https://claude.ai/install.sh | bash
