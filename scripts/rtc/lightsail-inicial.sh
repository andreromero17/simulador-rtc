#!/bin/bash
# =============================================================================
# Preparação do servidor Lightsail (Ubuntu 24.04) para o Simulador RTC.
# Cole este arquivo inteiro em "Launch script" ao criar a instância (roda uma vez, como root),
# ou rode depois com: sudo bash lightsail-inicial.sh
# Faz: fuso horário, atualizações, swap de 2 GB, Docker + Compose, atualizações automáticas de segurança.
# Log em /var/log/preparacao-servidor.log; terminou quando aparecer "PRONTO" no fim do arquivo.
# =============================================================================
set -euxo pipefail
exec > >(tee -a /var/log/preparacao-servidor.log) 2>&1

export DEBIAN_FRONTEND=noninteractive
timedatectl set-timezone America/Sao_Paulo

apt-get update
apt-get -y -o Dpkg::Options::="--force-confold" upgrade
apt-get install -y ca-certificates curl git unattended-upgrades

# swap de 2 GB: a compilação da imagem precisa de folga de memória numa máquina de 2 GB
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf
fi

# Docker (repositório oficial) + plugin compose
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker ubuntu
systemctl enable --now docker

# logs do Docker com tamanho limitado (o disco não enche)
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
JSON
systemctl restart docker

# atualizações de segurança automáticas
dpkg-reconfigure -f noninteractive unattended-upgrades

docker run --rm hello-world
echo "PRONTO"
