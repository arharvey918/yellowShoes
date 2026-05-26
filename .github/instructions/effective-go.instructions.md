---
description: "Enforce Effective Go standards when writing or modifying Go code. Covers formatting, naming, control flow, error handling, concurrency, and idiomatic patterns. Use when writing, reviewing, or refactoring any Go source file."
applyTo: "**/*.go"
---
# Effective Go

## Formatting
```go
// GOOD — opening brace on same line
if err != nil {
    return err
}

// BAD — brace on next line causes semicolon insertion
if err != nil
{
    return err
}
```

## Naming

Package names — short, lowercase, no stutter:
```go
// GOOD
package http

ring.New()           // not ring.NewRing()
bufio.Reader         // not bufio.BufReader

// BAD
package httpUtils
ring.NewRing()
```

Getters and setters:
```go
// GOOD
func (o *Obj) Owner() string    { return o.owner }
func (o *Obj) SetOwner(s string) { o.owner = s }

// BAD
func (o *Obj) GetOwner() string { return o.owner }
```

Interfaces — one method + `-er` suffix:
```go
type Reader interface { Read(p []byte) (n int, err error) }
type Formatter interface { Format(f fmt.State, c rune) }
```

Acronyms — consistent case:
```go
// GOOD
userID, xmlHTTPRequest, ServeHTTP, urlPath

// BAD
userId, xmlHttpRequest, ServeHttp
```

## Control Flow

Eliminate unnecessary else — handle errors first, happy path unindented:
```go
// GOOD
f, err := os.Open(name)
if err != nil {
    return err
}
d, err := f.Stat()
if err != nil {
    f.Close()
    return err
}
// use f and d

// BAD
if err != nil {
    return err
} else {
    // deeply nested happy path
}
```

Switch over if-else chains:
```go
// GOOD
switch {
case '0' <= c && c <= '9':
    return c - '0'
case 'a' <= c && c <= 'f':
    return c - 'a' + 10
}
```

## Data

Empty slices:
```go
// GOOD — nil slice
var s []string

// BAD — non-nil empty (unless JSON encoding needs [])
s := []string{}
```

Composite literals with named fields:
```go
// GOOD — clear, order-independent
return &File{fd: fd, name: name}

// BAD — positional, breaks when struct changes
return &File{fd, name, nil, 0}
```

Zero-value design — structs usable without constructors:
```go
var buf bytes.Buffer
buf.WriteString("hello")

var mu sync.Mutex
mu.Lock()
```

## Functions

Defer for cleanup — immediately after acquiring a resource:
```go
f, err := os.Open(path)
if err != nil {
    return nil, err
}
defer f.Close()

mu.Lock()
defer mu.Unlock()
```

Multiple return values with error:
```go
val, err := strconv.Atoi(s)
if err != nil {
    return 0, fmt.Errorf("parsing %q: %w", s, err)
}
```

## Error Handling

Always check errors — never discard:
```go
// GOOD
data, err := io.ReadAll(r)
if err != nil {
    return nil, fmt.Errorf("reading body: %w", err)
}

// BAD
data, _ := io.ReadAll(r)
```

Error strings — lowercase, no punctuation:
```go
// GOOD
fmt.Errorf("reading config: %w", err)

// BAD
fmt.Errorf("Reading config: %v.", err)
```

Don't panic in libraries — return errors:
```go
// GOOD
func Parse(input string) (*Result, error) {
    if input == "" {
        return nil, errors.New("empty input")
    }
}

// BAD
func Parse(input string) *Result {
    if input == "" {
        panic("empty input")
    }
}
```

## Interfaces

Define in consumer, return concrete from producer:
```go
// consumer package
type Storage interface {
    Get(key string) ([]byte, error)
}
func NewService(s Storage) *Service { ... }

// producer package — concrete type
func NewRedisStore(addr string) *RedisStore { ... }
```

Compile-time interface check:
```go
var _ io.ReadWriter = (*MyBuffer)(nil)
```

## Concurrency

Fixed worker pool over unbounded goroutine spawning:
```go
for i := 0; i < numWorkers; i++ {
    go func() {
        for job := range jobs {
            results <- process(job)
        }
    }()
}
```

Channel synchronization:
```go
done := make(chan struct{})
go func() {
    defer close(done)
    doWork()
}()
<-done
```

## Embedding

Use embedding for composition, not inheritance simulation:
```go
// GOOD — ReadWriter composes Reader and Writer
type ReadWriter struct {
    *Reader
    *Writer
}

// Embedded methods run with the inner type as receiver.
// Use type name as field name: job.Logger
```
