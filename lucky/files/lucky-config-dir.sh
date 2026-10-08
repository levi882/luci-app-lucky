#!/bin/sh
# Shared by LuCI saving and service startup; check mode never changes files.
export LC_ALL=C

fail() {
	printf '%s\n' "$1"
	exit 1
}

path="$1"
mode="${2:-check}"
case "$mode" in check|prepare) ;; *) fail check_failed ;; esac
case "$path" in
	/*) ;;
	*) fail invalid_path ;;
esac
case "$path" in
	*[[:space:]]|*/./*|*/.|*/../*|*/..) fail invalid_path ;;
esac
printf '%s' "$path" | grep -q '[[:cntrl:]]' && fail invalid_path
[ "${#path}" -le 4095 ] || fail invalid_path
while [ "${path%/}" != "$path" ]; do path="${path%/}"; done
[ -n "$path" ] || fail invalid_path

# Find the nearest existing ancestor, including broken symlinks and files.
parent="$path"
while [ ! -e "$parent" ] && [ ! -L "$parent" ]; do
	parent="${parent%/*}"
	[ -n "$parent" ] || parent=/
done
[ -d "$parent" ] || fail not_directory
[ -w "$parent" ] && [ -x "$parent" ] || fail not_writable

if [ "$mode" = prepare ]; then
	mkdir -p "$path" 2>/dev/null || fail create_failed
	# Permission bits alone do not detect a full filesystem or a read-only mount.
	probe="$(mktemp "$path/.lucky-write-check.XXXXXX" 2>/dev/null)" || fail not_writable
	printf 'lucky\n' > "$probe" 2>/dev/null
	result=$?
	rm -f "$probe" 2>/dev/null || fail not_writable
	[ "$result" = 0 ] || fail not_writable
fi
printf 'ok\n'
