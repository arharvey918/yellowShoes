---
description: "Enforce Go Test Comments standards when writing or modifying Go test files. Covers test structure, failure messages, table-driven tests, comparisons, and test helpers. Use when writing, reviewing, or refactoring Go test code."
applyTo: "**/*_test.go"
---
# Go Test Comments

## Test Structure
- Use table-driven tests when multiple cases share the same testing logic.
- Use separate test functions when cases require different validation logic.

## Failure Messages
- Always include function name, inputs, actual result, and expected result. Got before want:
```go
t.Errorf("ParseSize(%q) = %d, want %d", tt.input, got, tt.want)

// BAD — no function name, no input
t.Errorf("got %v, want %v", got, want)
```
- Name test cases descriptively; never use table index as the name.

## Keep Going
- Prefer `t.Error` over `t.Fatal` to report all failures in one run.
- Use `t.Fatal` only when setup fails and continuing is meaningless.
- In subtests (`t.Run`), `t.Fatal` ends only that subtest — use it freely there.

## Comparisons
- Compare full structures in one shot, not field-by-field. Use `cmp.Diff` for deep comparisons:
```go
if diff := cmp.Diff(want, got); diff != "" {
    t.Errorf("Transform() mismatch (-want +got):\n%s", diff)
}
```
- Prefer `cmp` over `reflect.DeepEqual` for new code.
- Compare semantically stable data, not serialized output (JSON bytes, formatted strings).

## No Assertion Libraries
- Don't use `testify/assert` or similar. Write checks in plain Go:
```go
if got != tt.want {
    t.Errorf("Foo(%q) = %d; want %d", tt.in, got, tt.want)
}
```
Assertion libraries create a mini-language that obscures test logic and produces worse failure messages.

## Test Helpers
- Call `t.Helper()` at the start of any test helper function for correct line reporting:
```go
func mustReadFile(t *testing.T, path string) []byte {
    t.Helper()
    data, err := os.ReadFile(path)
    if err != nil {
        t.Fatal(err)
    }
    return data
}
```

## Subtests
- Use human-readable names in `t.Run`. Avoid spaces (they become underscores in output).
- Use `t.Log` in the subtest body for input details rather than encoding everything in the name.

## Table-Driven Tests Pattern
```go
func TestFoo(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    int
        wantErr bool
    }{
        {name: "valid", input: "42", want: 42},
        {name: "empty", input: "", wantErr: true},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Foo(tt.input)
            if (err != nil) != tt.wantErr {
                t.Fatalf("Foo(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
            }
            if got != tt.want {
                t.Errorf("Foo(%q) = %d, want %d", tt.input, got, tt.want)
            }
        })
    }
}
```

## Error Testing
- Test error semantics (type, sentinel), not message strings:
```go
if !errors.Is(err, ErrNotFound) {
    t.Errorf("Lookup(%q) error = %v, want ErrNotFound", key, err)
}
```
- Use `fmt.Errorf` when you only care that an error occurred, not its specific type.

## Diffs
- For large outputs, print diffs instead of both values. Include direction:
```go
if diff := cmp.Diff(want, got); diff != "" {
    t.Errorf("BuildReport() mismatch (-want +got):\n%s", diff)
}
```
