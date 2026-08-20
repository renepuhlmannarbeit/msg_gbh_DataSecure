# Building the plugin

The repository keeps one canonical runtime under `/server`. `npm run build:plugin` creates a self-contained plugin ZIP and copies the tested runtime into the plugin package before packaging. End users do not install npm dependencies or run build commands.
