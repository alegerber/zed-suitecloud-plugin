use zed_extension_api::{self as zed, Command, ContextServerId, Project, Result};

const PACKAGE_NAME: &str = "suitecloud-mcp";
const SERVER_PATH: &str = "node_modules/suitecloud-mcp/dist/index.js";

struct SuiteCloudExtension;

impl zed::Extension for SuiteCloudExtension {
    fn new() -> Self {
        Self
    }

    fn context_server_command(
        &mut self,
        _context_server_id: &ContextServerId,
        _project: &Project,
    ) -> Result<Command> {
        let latest_version = zed::npm_package_latest_version(PACKAGE_NAME)?;
        let installed_version = zed::npm_package_installed_version(PACKAGE_NAME)?;
        if installed_version.as_deref() != Some(latest_version.as_str()) {
            zed::npm_install_package(PACKAGE_NAME, &latest_version)?;
        }

        let server_path = std::env::current_dir()
            .map_err(|err| err.to_string())?
            .join(SERVER_PATH)
            .to_string_lossy()
            .to_string();

        Ok(Command {
            command: zed::node_binary_path()?,
            args: vec![server_path],
            env: vec![],
        })
    }
}

zed::register_extension!(SuiteCloudExtension);
