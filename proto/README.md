# proto

Contratos gRPC (`match.proto` y `players.proto`): la única fuente de verdad entre `gateway`, `match` y `players`.
Go genera su código con `match/gen.sh`, Rust con `players/build.rs` y NestJS los carga al arrancar. Python no usa gRPC.
Cada cambio lo revisan al menos dos personas, porque afecta a varios servicios. Ver la skill `change-contract`.
