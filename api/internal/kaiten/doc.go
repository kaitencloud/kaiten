// Package kaiten is the application: the one place the object graph is built,
// and the one way to reach a use case. Drivers -- the HTTP server, the seeder,
// cmd/admin-tools -- ask for an application rather than assembling one.
//
// # The contract
//
// Six properties, each enforced by a fitness test in tests/architecture:
//
//  1. No exported signature here names a transport type. A new driver needs its
//     own caller constructor and registration package, nothing here.
//  2. Every facade method taking an OrganizationCaller or PlatformCaller
//     requires the RequiredScope const of the operation it fronts, and the
//     transport registrar passes the same const, so enforced and published
//     authorization cannot drift. This is the only place a scope is enforced
//     for an operation: there is no scope middleware on either router. The
//     transport keeps the credential-CLASS check, which is decidable before a
//     body is parsed -- so validation runs before authorization, and a caller
//     that is both under-scoped and sending an invalid body is told about the
//     body. The one read path that reaches no facade method is /graphql, whose
//     resolvers read each module's rows directly: a gate of its own, in front
//     of those resolvers, holds it to the RequiredScope of the operations
//     serving the same resources (infrastructure/http/graphql/scope.go, which
//     also says what it requires where no operation does).
//  3. Credential class is structural. Platform operations take a
//     PlatformCaller, everything else an OrganizationCaller, and
//     credential-free ones live on InProcess and take no caller. The compiler
//     refuses the mistake, so there is no runtime kind check to drift.
//  4. principal.Principal composite literals exist in exactly two packages:
//     internal/platform/auth and this one. Identity enters through those doors.
//  5. InProcess is referenced only from internal/platform/jit, cmd/admin-tools,
//     internal/seeder, and http/server to wire it; its use cases import no
//     transport and appear in no OpenAPI document.
//  6. No endpoint.go calls a use case's Execute and no handler.go names a
//     transport, so an operation cannot keep private enforcement no other
//     driver can see. identity/validatetoken and validateplatformtoken are
//     exempt: they authenticate rather than act, and produce a caller.
//
// Facade methods take the use cases' own *Command types, authorize, bind the
// caller into the context and call Execute. A method doing more than that is a
// use case wearing the wrong hat. Which operations exist, their paths and
// schemas, and how a request becomes a *Command stay in
// internal/modules/<slice>/<usecase>.
package kaiten
