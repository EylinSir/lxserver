// Older releases used frontend.password for the administrator credential.
// Apply this before filtering unknown configuration keys during startup.
export const migrateLegacyConfig = (config: Record<string, any>): Record<string, any> => {
  if (config['admin.password'] === undefined && typeof config['frontend.password'] === 'string') {
    return { ...config, 'admin.password': config['frontend.password'] }
  }
  return config
}
