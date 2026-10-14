#!/usr/bin/env bash
# One-time preparation of a fresh Oracle Cloud Ubuntu VM for Quantix (run by tools/deploy_oracle.py with sudo).
# Safe to run again: every step checks first.
set -euo pipefail

echo "== packages: Docker + Compose, firewall persistence"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q docker.io docker-compose-v2 iptables-persistent
systemctl enable --now docker
usermod -aG docker ubuntu || true

echo "== firewall: Oracle's Ubuntu image blocks everything except SSH; open 80 (HTTP) and 443 (HTTPS)"
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    iptables -I INPUT 6 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
netfilter-persistent save

echo "== 4 GB swap (headroom while the image builds)"
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== automatic security updates"
apt-get install -y -q unattended-upgrades
echo "server ready"
