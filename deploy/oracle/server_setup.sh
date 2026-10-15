#!/usr/bin/env bash
# One-time preparation of a fresh Oracle Cloud Ubuntu VM for Quantix (run by tools/deploy_oracle.py with sudo).
# Works on the Always Free shapes: Ampere A1 (ARM) and the 1 GB VM.Standard.E2.1.Micro. Safe to run again.
set -euo pipefail

echo "== 4 GB swap first (the Micro shape has only 1 GB of memory; installs and the AI model need headroom)"
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=60 >/dev/null

echo "== packages: Docker + Compose, firewall persistence"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q docker.io docker-compose-v2 iptables-persistent
systemctl enable --now docker
usermod -aG docker ubuntu || true

echo "== firewall: Oracle's Ubuntu image rejects everything except SSH; allow 80 (HTTP) and 443 (HTTPS)"
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    # insert just above the catch-all REJECT rule (a rule after it would never be reached)
    pos=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')
    iptables -I INPUT "${pos:-1}" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
netfilter-persistent save

echo "== automatic security updates"
apt-get install -y -q unattended-upgrades
echo "server ready"
