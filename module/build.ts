export interface ModuleOptions {}

export default async function (options: ModuleOptions) {
  console.log('[@tinijs/content] Build: ', options);
}
