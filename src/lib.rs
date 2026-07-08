use zed_extension_api::{
    self as zed, Command, ContextServerConfiguration, ContextServerId, Project, Result,
};

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
        let installed_version = zed::npm_package_installed_version(PACKAGE_NAME)?;
        match zed::npm_package_latest_version(PACKAGE_NAME) {
            Ok(latest_version) => {
                if installed_version.as_deref() != Some(latest_version.as_str()) {
                    zed::npm_install_package(PACKAGE_NAME, &latest_version)?;
                }
            }
            Err(err) => {
                // Offline or registry unreachable: keep the installed version if present.
                if installed_version.is_none() {
                    return Err(err);
                }
            }
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

    fn context_server_configuration(
        &mut self,
        _context_server_id: &ContextServerId,
        _project: &Project,
    ) -> Result<Option<ContextServerConfiguration>> {
        Ok(Some(ContextServerConfiguration {
            installation_instructions: include_str!("../configuration/installation_instructions.md")
                .to_string(),
            default_settings: "{}".to_string(),
            settings_schema: r#"{"type":"object","properties":{}}"#.to_string(),
        }))
    }
}

zed::register_extension!(SuiteCloudExtension);
