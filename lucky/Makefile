# SPDX-License-Identifier: GPL-3.0-only
#

include $(TOPDIR)/rules.mk

PKG_NAME:=lucky
PKG_VERSION:=3.0.0_beta5
PKG_RELEASE:=1
PKGARCH:=all 
LUCKY_RELEASE_BASE:=https://release.66666.host
LUCKY_RELEASE_DIR:=v3.0.0beta5
LUCKY_FILE_VERSION:=3.0.0
LUCKY_VARIANT:=wanji
LUCKY_VARIANT_SUFFIX:=$(if $(filter lucky,$(LUCKY_VARIANT)),,_$(LUCKY_VARIANT))
LUCKY_CONF_DIR := /etc/config/lucky.daji
LUCKY_TMP_BACKUP := /tmp/luckyconfdir
LUCKY_USE_UPX?=1
LUCKY_UPX_FLAGS?=--best --lzma

ifeq ($(ARCH),mipsel)
	LUCKY_ARCH:=mipsle_softfloat
endif
ifeq ($(ARCH),mips)
	LUCKY_ARCH:=mips_softfloat
endif
ifeq ($(ARCH),i386)
	LUCKY_ARCH:=i386
endif
ifeq ($(ARCH),x86_64)
	LUCKY_ARCH:=x86_64
endif
ifeq ($(ARCH),arm)
	ifeq ($(BOARD),bcm53xx)
		LUCKY_ARCH:=armv6
	else
		LUCKY_ARCH:=armv7
	endif
endif
ifeq ($(BOARD),bcm53xx)
	LUCKY_ARCH:=armv6
ifeq ($(word 2,$(subst +,$(space),$(call qstrip,$(CONFIG_CPU_TYPE)))),)
	LUCKY_ARCH:=armv5
endif
endif
ifeq ($(BOARD),kirkwood)
	LUCKY_ARCH:=armv5
endif
ifeq ($(ARCH),aarch64)
	LUCKY_ARCH:=arm64
endif

PKG_LICENSE:=GPL-3.0-only
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=GDY666 <gdy666@foxmail.com>

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)
PKG_HASH:=skip
LUCKY_ARCHIVE:=$(PKG_NAME)_$(LUCKY_FILE_VERSION)_Linux_$(LUCKY_ARCH)$(LUCKY_VARIANT_SUFFIX).tar.gz
LUCKY_DOWNLOAD_URL:=$(LUCKY_RELEASE_BASE)/$(LUCKY_RELEASE_DIR)/$(LUCKY_FILE_VERSION)_$(LUCKY_VARIANT)/$(LUCKY_ARCHIVE)

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=net
	CATEGORY:=Network
	TITLE:=Lucky gdy
	DEPENDS:=@x86_64
	URL:=https://github.com/gdy666/lucky
endef

define Package/$(PKG_NAME)/description
  Main functions of Lucky: ipv4/ipv6 portforward,ddns,IOT wake on lan ,reverse proxy and more...
endef




define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	[ -f $(PKG_BUILD_DIR)/$(LUCKY_ARCHIVE) ] || wget $(LUCKY_DOWNLOAD_URL) -O $(PKG_BUILD_DIR)/$(LUCKY_ARCHIVE)
	tar -xzvf $(PKG_BUILD_DIR)/$(LUCKY_ARCHIVE) -C $(PKG_BUILD_DIR)
	chmod +x $(PKG_BUILD_DIR)/lucky
	if [ "$(LUCKY_USE_UPX)" = "1" ]; then \
		command -v upx >/dev/null 2>&1 || { echo "upx is required when LUCKY_USE_UPX=1" >&2; exit 1; }; \
		echo "Lucky binary before UPX:"; \
		ls -lh $(PKG_BUILD_DIR)/lucky; \
		upx $(LUCKY_UPX_FLAGS) $(PKG_BUILD_DIR)/lucky; \
		echo "Lucky binary after UPX:"; \
		ls -lh $(PKG_BUILD_DIR)/lucky; \
	fi
endef



define Package/$(PKG_NAME)/conffiles
/etc/config/lucky
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_DIR) $(1)/etc/config/
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/lucky $(1)/usr/bin/lucky
	$(INSTALL_BIN) ./files/lucky.init $(1)/etc/init.d/lucky
	$(INSTALL_CONF) $(CURDIR)/files/luckyuci $(1)/etc/config/lucky
endef



$(eval $(call BuildPackage,$(PKG_NAME)))
