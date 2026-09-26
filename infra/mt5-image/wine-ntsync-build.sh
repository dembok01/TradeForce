#!/bin/bash
# Build Wine 11.0 from official source with ntsync ("inproc sync") compiled in.
# WineHQ's own packages ship it disabled because their build hosts have no
# linux/ntsync.h - that header is the whole difference, and it comes from
# Ubuntu's own linux-libc-dev for 6.14, the kernel that first carried the driver.
set -eux
cd /work
rm -f /etc/apt/sources.list.d/winehq*
apt-get update -qq
apt-get install -y --no-install-recommends \
  build-essential flex bison pkg-config \
  gcc-mingw-w64-x86-64-posix gcc-mingw-w64-i686-posix \
  libfreetype6-dev libx11-dev libxext-dev libxrender-dev libxrandr-dev \
  libxi-dev libxcursor-dev libxcomposite-dev libxinerama-dev libxxf86vm-dev \
  libgnutls28-dev libfontconfig-dev libpng-dev libjpeg-dev libtiff-dev \
  libxml2-dev libxslt1-dev libasound2-dev libudev-dev libusb-1.0-0-dev \
  libcups2-dev libdbus-1-dev libpcap-dev libvulkan-dev libpulse-dev
# After the toolchain, so that /usr/include/linux exists to drop it into.
dpkg -x linux-libc-dev_6.14.0-37.37_amd64.deb /work/hdr
install -Dm644 /work/hdr/usr/include/linux/ntsync.h /usr/include/linux/ntsync.h
cd /work/wine-11.0
./configure --prefix=/opt/wine-ntsync --enable-archs=i386,x86_64 --disable-tests
echo "=== ntsync detected? ==="
grep -E "HAVE_LINUX_NTSYNC_H" include/config.h || { echo "FATAL: ntsync NOT detected"; exit 1; }
echo "=== gnutls (broker TLS)? ==="
grep -E "SONAME_LIBGNUTLS" include/config.h || echo "WARNING: no gnutls"
nice -n 5 make -j10
make install
/opt/wine-ntsync/bin/wine --version
echo BUILD_OK
