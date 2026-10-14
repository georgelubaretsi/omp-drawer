# The image the omp and Tern demos record in (docs/demos.md, "Recording in a virtual machine"):
# macOS in dark mode with Tern, Nix, omp and the recorder's tools (the flake's demo-machine), copied
# from this Mac, and nothing signed in. tools/demo/vm/image.ts builds it (`packer build` with the
# variables below); each demo records in a throwaway clone of it (run.ts).

packer {
  required_plugins {
    tart = {
      version = "= 1.21.0"
      source  = "github.com/cirruslabs/tart"
    }
  }
}

variable "base" {
  type        = string
  description = "The image to start from, as tart names it."
  default     = "ghcr.io/cirruslabs/macos-tahoe-vanilla:latest"
}

variable "name" {
  type        = string
  description = "The image to make."
  default     = "piebird-demo-base"
}

variable "tern_zip" {
  type        = string
  description = "Tern.app from this Mac, zipped with ditto."
}

variable "ssh_public_key" {
  type        = string
  description = "The public key this Mac's tools sign in to the machine with (nix copy, the recorder)."
}

variable "ssh_private_key" {
  type        = string
  description = "Its private key, for nix copy."
}

variable "closures" {
  type        = string
  description = "The store paths to copy and install in the user's profile, space-separated: omp and the flake's demo-machine."
}

source "tart-cli" "demo" {
  vm_base_name = var.base
  vm_name      = var.name
  cpu_count    = 6
  memory_gb    = 12
  disk_size_gb = 90
  # Points: the machine's screen is Retina, so Tern draws the demo at twice its size.
  display      = "1440x900"
  headless     = true
  ssh_username = "admin"
  ssh_password = "admin"
  ssh_timeout  = "300s"
}

build {
  sources = ["source.tart-cli.demo"]

  provisioner "file" {
    source      = var.tern_zip
    destination = "/tmp/Tern.zip"
  }

  provisioner "file" {
    source      = var.ssh_public_key
    destination = "/tmp/demo.pub"
  }

  provisioner "shell" {
    inline = [
      # tart's own DNS answers nothing on some networks; public resolvers do.
      "sudo networksetup -setdnsservers Ethernet 1.1.1.1 8.8.8.8",
      "ditto -x -k /tmp/Tern.zip /Applications",
      "rm /tmp/Tern.zip",
      # A Tern window in the background must keep answering (piebird-tern-bridge's README).
      "defaults write so.stencil.tern NSAppSleepDisabled -bool YES",
      # Every demo is dark: the system's appearance, which pages and apps follow.
      "defaults write -g AppleInterfaceStyle Dark",
      # The recorder installs and signs in as this machine's user only where this file is.
      "sudo touch /etc/piebird-demo-machine",
      "mkdir -p ~/.ssh",
      "cat /tmp/demo.pub >> ~/.ssh/authorized_keys",
      "chmod 600 ~/.ssh/authorized_keys",
      "sudo pmset -a sleep 0 displaysleep 0 disksleep 0",
      # Determinate's installer, at a release past the 14-day age gate, downloaded first so a
      # failed download stops the build.
      "curl --proto '=https' --tlsv1.2 -sSfL -o /tmp/nix-installer.sh https://install.determinate.systems/nix/tag/v3.22.5",
      "sh /tmp/nix-installer.sh install --no-confirm",
      "rm /tmp/nix-installer.sh",
    ]
  }

  # This Mac's store paths are unsigned: the copy talks to a nix-daemon running as root (the image's
  # user may sudo without a password), which takes them.
  provisioner "shell-local" {
    environment_vars = [
      "NIX_SSHOPTS=-i ${var.ssh_private_key} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR",
    ]
    inline = [
      "nix copy --no-check-sigs --to 'ssh-ng://admin@${build.Host}?remote-program=sudo%20-n%20/nix/var/nix/profiles/default/bin/nix-daemon' ${var.closures}",
    ]
  }

  # Installed as anyone installs Nix packages: in the user's profile, on PATH in every shell.
  provisioner "shell" {
    inline = [
      ". /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh && nix profile add ${var.closures}",
    ]
  }
}
