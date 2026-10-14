package secrets

// The macOS Keychain, through the Security framework, called in-process with purego (the build
// has no cgo). An item a program adds trusts that program: with a stable code signature, the
// same program reads it again without asking, and any other program has to ask the person. That
// is why this never runs /usr/bin/security, which would put the secret on its command line and
// make itself the trusted program.

import (
	"bytes"
	"sync"
	"unsafe"

	"github.com/ebitengine/purego"

	"piebird.dev/plugins/internal/text"
)

const (
	errSecSuccess        int32  = 0
	errSecItemNotFound   int32  = -25300
	cfStringEncodingUTF8 uint32 = 0x08000100
)

// systemVault is the login keychain, the program's items filed under service. file is unused:
// every Mac has a keychain.
func systemVault(service, _ string) vault { return keychain{service: service} }

// secAPI is the part of CoreFoundation and Security the keychain vault calls.
type secAPI struct {
	dictionaryCreate func(alloc uintptr, keys, values []uintptr, n int, keyCallBacks, valueCallBacks uintptr) uintptr
	arrayCreate      func(alloc uintptr, values []uintptr, n int, callBacks uintptr) uintptr
	stringCreate     func(alloc uintptr, b []byte, n int, encoding uint32, external bool) uintptr
	stringLength     func(s uintptr) int
	stringCString    func(s uintptr, buf []byte, size int, encoding uint32) bool
	dataCreate       func(alloc uintptr, b []byte, n int) uintptr
	dataBytes        func(data uintptr) *byte
	dataLength       func(data uintptr) int
	release          func(ref uintptr)
	itemAdd          func(attributes, result uintptr) int32
	itemCopyMatching func(query uintptr, result *uintptr) int32
	itemUpdate       func(query, attributes uintptr) int32
	itemDelete       func(query uintptr) int32
	errorMessage     func(status int32, reserved uintptr) uintptr

	// The frameworks' constants: the CFStringRef keys and values, kCFBooleanTrue, and the
	// addresses of the dictionary and array callbacks.
	class, genericPassword, service, account, label, valueData uintptr
	returnData, matchLimit, matchLimitOne, yes                 uintptr
	useKeychain, matchSearchList                               uintptr
	keyCallBacks, valueCallBacks, arrayCallBacks               uintptr
}

// security loads the frameworks once.
var security = sync.OnceValues(func() (*secAPI, error) {
	cf, err := purego.Dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", purego.RTLD_LAZY)
	if err != nil {
		return nil, err
	}
	sec, err := purego.Dlopen("/System/Library/Frameworks/Security.framework/Security", purego.RTLD_LAZY)
	if err != nil {
		return nil, err
	}
	a := &secAPI{}
	for name, fn := range map[string]any{
		"CFDictionaryCreate": &a.dictionaryCreate, "CFArrayCreate": &a.arrayCreate, "CFStringCreateWithBytes": &a.stringCreate,
		"CFStringGetLength": &a.stringLength, "CFStringGetCString": &a.stringCString,
		"CFDataCreate": &a.dataCreate, "CFDataGetBytePtr": &a.dataBytes, "CFDataGetLength": &a.dataLength,
		"CFRelease": &a.release,
	} {
		purego.RegisterLibFunc(fn, cf, name)
	}
	for name, fn := range map[string]any{
		"SecItemAdd": &a.itemAdd, "SecItemCopyMatching": &a.itemCopyMatching, "SecItemUpdate": &a.itemUpdate,
		"SecItemDelete": &a.itemDelete, "SecCopyErrorMessageString": &a.errorMessage,
	} {
		purego.RegisterLibFunc(fn, sec, name)
	}
	symbols := []struct {
		lib   uintptr
		name  string
		to    *uintptr
		value bool // the constant's value, not its address
	}{
		{sec, "kSecClass", &a.class, true},
		{sec, "kSecClassGenericPassword", &a.genericPassword, true},
		{sec, "kSecAttrService", &a.service, true},
		{sec, "kSecAttrAccount", &a.account, true},
		{sec, "kSecAttrLabel", &a.label, true},
		{sec, "kSecValueData", &a.valueData, true},
		{sec, "kSecReturnData", &a.returnData, true},
		{sec, "kSecMatchLimit", &a.matchLimit, true},
		{sec, "kSecMatchLimitOne", &a.matchLimitOne, true},
		{sec, "kSecUseKeychain", &a.useKeychain, true},
		{sec, "kSecMatchSearchList", &a.matchSearchList, true},
		{cf, "kCFBooleanTrue", &a.yes, true},
		{cf, "kCFTypeDictionaryKeyCallBacks", &a.keyCallBacks, false},
		{cf, "kCFTypeDictionaryValueCallBacks", &a.valueCallBacks, false},
		{cf, "kCFTypeArrayCallBacks", &a.arrayCallBacks, false},
	}
	for _, s := range symbols {
		addr, err := purego.Dlsym(s.lib, s.name)
		if err != nil {
			return nil, err
		}
		*s.to = addr
		if s.value {
			*s.to = deref(addr)
		}
	}
	return a, nil
})

// deref is the pointer-sized value at addr: a framework constant, from its symbol's address.
func deref(addr uintptr) uintptr {
	return **(**uintptr)(unsafe.Pointer(&addr))
}

// dict is a CFDictionary of the key and value pairs; the caller releases it.
func (a *secAPI) dict(pairs ...uintptr) uintptr {
	keys, values := make([]uintptr, 0, len(pairs)/2), make([]uintptr, 0, len(pairs)/2)
	for i := 0; i+1 < len(pairs); i += 2 {
		keys, values = append(keys, pairs[i]), append(values, pairs[i+1])
	}
	return a.dictionaryCreate(0, keys, values, len(keys), a.keyCallBacks, a.valueCallBacks)
}

// str is a CFString of s; the caller releases it.
func (a *secAPI) str(s string) uintptr {
	return a.stringCreate(0, []byte(s+"\x00"), len(s), cfStringEncodingUTF8, false)
}

// data is a CFData of s; the caller releases it.
func (a *secAPI) data(s string) uintptr {
	return a.dataCreate(0, []byte(s+"\x00"), len(s))
}

// goString is the CFString s as Go text, "" when it won't convert.
func (a *secAPI) goString(s uintptr) string {
	buf := make([]byte, a.stringLength(s)*4+1)
	if !a.stringCString(s, buf, len(buf), cfStringEncodingUTF8) {
		return ""
	}
	n := bytes.IndexByte(buf, 0)
	if n < 0 {
		n = len(buf)
	}
	return string(buf[:n])
}

// statusError is the Keychain's error status, with the system's words for it.
func (a *secAPI) statusError(status int32) error {
	message := ""
	if s := a.errorMessage(status, 0); s != 0 {
		message = a.goString(s)
		a.release(s)
	}
	return texts.Get("errors/keychain").Err(text.V{"Status": status, "Message": message})
}

// keychain is a keychain's generic passwords under service, one per key (the account): the
// default keychain's, or, when file is set (a SecKeychainRef), that keychain's alone, as the
// tests use a throwaway one.
type keychain struct {
	service string
	file    uintptr
}

// item is a query for the item key, or the attributes to add it with, with extra key and value
// pairs; done releases it.
func (k keychain) item(a *secAPI, key string, adding bool, extra ...uintptr) (query uintptr, done func()) {
	service, account := a.str(k.service), a.str(key)
	pairs := append([]uintptr{a.class, a.genericPassword, a.service, service, a.account, account}, extra...)
	var list uintptr
	switch {
	case k.file != 0 && adding:
		pairs = append(pairs, a.useKeychain, k.file)
	case k.file != 0:
		list = a.arrayCreate(0, []uintptr{k.file}, 1, a.arrayCallBacks)
		pairs = append(pairs, a.matchSearchList, list)
	}
	query = a.dict(pairs...)
	return query, func() {
		a.release(query)
		a.release(service)
		a.release(account)
		if list != 0 {
			a.release(list)
		}
	}
}

func (k keychain) get(key string) (string, bool, error) {
	a, err := security()
	if err != nil {
		return "", false, err
	}
	query, done := k.item(a, key, false, a.returnData, a.yes, a.matchLimit, a.matchLimitOne)
	defer done()
	var data uintptr
	switch status := a.itemCopyMatching(query, &data); status {
	case errSecSuccess:
		defer a.release(data)
		n := a.dataLength(data)
		if n == 0 {
			return "", false, nil
		}
		return string(unsafe.Slice(a.dataBytes(data), n)), true, nil
	case errSecItemNotFound:
		return "", false, nil
	default:
		return "", false, a.statusError(status)
	}
}

func (k keychain) set(key, label, secret string) error {
	a, err := security()
	if err != nil {
		return err
	}
	value, name := a.data(secret), a.str(label)
	defer a.release(value)
	defer a.release(name)
	query, done := k.item(a, key, false)
	defer done()
	update := a.dict(a.valueData, value, a.label, name)
	defer a.release(update)
	status := a.itemUpdate(query, update)
	if status == errSecItemNotFound {
		add, doneAdd := k.item(a, key, true, a.valueData, value, a.label, name)
		defer doneAdd()
		status = a.itemAdd(add, 0)
	}
	if status != errSecSuccess {
		return a.statusError(status)
	}
	return nil
}

func (k keychain) forget(key string) error {
	a, err := security()
	if err != nil {
		return err
	}
	query, done := k.item(a, key, false)
	defer done()
	if status := a.itemDelete(query); status != errSecSuccess && status != errSecItemNotFound {
		return a.statusError(status)
	}
	return nil
}

func (keychain) source() Source { return Source{Kind: "keychain"} }
