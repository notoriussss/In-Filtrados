fn main() {
    tonic_build::compile_protos("../proto/players.proto").expect("failed to compile players.proto");
}
