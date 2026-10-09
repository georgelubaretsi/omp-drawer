{
  description = "omp-drawer plugins and development tooling";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      packages = forAllSystems (system: {
        default = (pkgsFor system).bun;
      });

      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.bun
              pkgs.gh
              pkgs.git
              pkgs.jq
              pkgs.nixfmt
              # Luau lint and format (selene.toml, stylua.toml).
              pkgs.selene
              pkgs.stylua
              # Pinned plugin tools: `mise lock` refreshes a plugin's mise.lock.
              pkgs.mise
            ];
          };
        }
      );

      formatter = forAllSystems (system: (pkgsFor system).nixfmt);

      checks = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          bun-version = pkgs.runCommand "omp-bun-version" { nativeBuildInputs = [ pkgs.bun ]; } ''
            bun --version > "$out"
          '';

          marketplace =
            pkgs.runCommand "omp-marketplace-catalog"
              {
                nativeBuildInputs = [ pkgs.jq ];
                src = self;
              }
              ''
                jq -e '.name and (.plugins | type == "array")' "$src/.omp-plugin/marketplace.json" > /dev/null
                touch "$out"
              '';
        }
      );
    };
}
