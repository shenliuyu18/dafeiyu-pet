package main

import (
	"archive/zip"
	"bytes"
	"io"
	"io/fs"
	"path"
	"strings"
	"time"
)

// Go embed 不接受中文文件名，所以 assets 被打包成 store-only 的 assets.zip；
// 这里用内存 zip 读取器把它伪装成 fs.FS，供 Wails 静态服务器直接读取（支持 Range）。
type zipFS struct {
	frontend fs.FS
	files    map[string]*zip.File
}

var petAssets *zipFS

func newZipFS(frontend fs.FS) (*zipFS, error) {
	b, err := fs.ReadFile(frontend, "assets.zip")
	if err != nil {
		return nil, err
	}
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return nil, err
	}
	m := make(map[string]*zip.File, len(zr.File))
	for _, f := range zr.File {
		m[f.Name] = f
	}
	return &zipFS{frontend: frontend, files: m}, nil
}

func (z *zipFS) Open(name string) (fs.File, error) {
	clean := path.Clean(strings.TrimPrefix(name, "/"))
	if strings.HasPrefix(clean, "assets/") {
		f, ok := z.files[clean]
		if !ok {
			return nil, fs.ErrNotExist
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		defer rc.Close()
		b, err := io.ReadAll(rc)
		if err != nil {
			return nil, err
		}
		return &memFile{
			reader: bytes.NewReader(b),
			name:   path.Base(clean),
			size:   int64(len(b)),
		}, nil
	}
	return z.frontend.Open(clean)
}

func (z *zipFS) read(name string) ([]byte, error) {
	f, ok := z.files[name]
	if !ok {
		return nil, fs.ErrNotExist
	}
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

func readAsset(name string) ([]byte, error) {
	if petAssets == nil {
		return nil, fs.ErrNotExist
	}
	return petAssets.read(name)
}

type memFile struct {
	reader *bytes.Reader
	name   string
	size   int64
}

func (f *memFile) Stat() (fs.FileInfo, error) { return memInfo{f}, nil }
func (f *memFile) Read(p []byte) (int, error) { return f.reader.Read(p) }
func (f *memFile) Seek(offset int64, whence int) (int64, error) {
	return f.reader.Seek(offset, whence)
}
func (f *memFile) Close() error { return nil }

type memInfo struct{ f *memFile }

func (i memInfo) Name() string       { return i.f.name }
func (i memInfo) Size() int64        { return i.f.size }
func (i memInfo) Mode() fs.FileMode  { return 0644 }
func (i memInfo) ModTime() time.Time { return time.Time{} }
func (i memInfo) IsDir() bool        { return false }
func (i memInfo) Sys() interface{}   { return nil }
