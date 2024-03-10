import {resolve} from 'pathe';
import chalk from 'chalk';
import fsExtra from 'fs-extra';
import {createHash} from 'crypto';
import {decodeHTML} from 'entities';
import {minify} from 'html-minifier';
import ora from 'ora';
import matter from 'gray-matter';
import toml from 'toml';
import transliterate from '@sindresorhus/transliterate';
import slugify from '@sindresorhus/slugify';
import {execaCommand} from 'execa';
import {cleanDir, listDir} from '@tinijs/cli';
import {consola} from 'consola';
import {getTiniApp} from 'tinijs';

const {blueBright, green} = chalk;
const {exists, ensureDir, outputJson, copyFile, readFile} = fsExtra;

export interface ModuleOptions {}

interface BuildOptions {
  collectTags?: false | {collection: string; field?: string};
}

interface Tag {
  slug: string;
  title: string;
}

export default async function (options: ModuleOptions) {
  const eleventyConfigPath = resolve('content', 'eleventy.config.js');
  if (!(await exists(eleventyConfigPath))) {
    return consola.error(
      'Invalid content project (no content/eleventy.config.js found).'
    );
  }
  const {
    config: {tempDir, outDir},
  } = await getTiniApp();
  const stagingContentDir = `${tempDir}/content`;
  const tiniContentDir = `${outDir}/tini-content`;
  const srcPath = resolve(stagingContentDir);
  const destPath = resolve(tiniContentDir);
  // clear the staging and tini-content dir
  await cleanDir(srcPath);
  await cleanDir(destPath);
  // 11ty render
  console.log('');
  const spinner = ora('Compile content using 11ty ...\n').start();
  execaCommand(`npx @11ty/eleventy --config="${eleventyConfigPath}"`, {
    stdio: 'ignore',
  });
  // read content
  spinner.text = 'Read content from staging ...';
  const {copyPaths, buildPaths} = (await listDir(srcPath)).reduce(
    (result, item) => {
      if (
        ~item.indexOf('/uploads/') ||
        ~item.indexOf(`/${tempDir}/images/`) ||
        !item.endsWith('.html')
      ) {
        result.copyPaths.push(item);
      } else {
        result.buildPaths.push(item);
      }
      return result;
    },
    {
      copyPaths: [] as string[],
      buildPaths: [] as string[],
    }
  );

  // copy
  spinner.text = 'Copy uploaded content ...';
  await Promise.all(
    copyPaths.map(async path => {
      const filePath = path.replace(tempDir, tiniContentDir);
      await ensureDir(filePath.replace(/\/[^/]+$/, ''));
      return copyFile(path, filePath);
    })
  );

  // build
  const indexRecord = {} as Record<string, string>;
  const collectionRecord = {} as Record<string, any[]>;
  const fulltextSearchRecord = {} as Record<string, Record<string, any>>;
  const collectedTagsRecord = {} as Record<string, Record<string, Tag>>;

  let buildCount = 0;
  for (let i = 0; i < buildPaths.length; i++) {
    const path = buildPaths[i];
    const [collection, slug] = path
      .split(`/${tempDir}/`)
      .pop()!
      .replace(/\/[^/]+$/, '')
      .split('/');

    spinner.text = `Build: ${green(`${collection}/${slug}`)} ...`;

    // process raw content
    let rawContent = await readFile(path, 'utf8');
    rawContent = rawContent.replace(/(<p>\+\+\+)|(\+\+\+<\/p>)/g, '+++');
    const matterMatching = rawContent.match(/\+\+\+([\s\S]*?)\+\+\+/);
    if (!matterMatching) continue;
    const matterData = decodeHTML(matterMatching[1].replace(/\\n\\/g, '\n'));
    rawContent = rawContent.replace(matterMatching[0], `---${matterData}---`);
    const {content, data} = matter(rawContent, {
      engines: {
        toml: toml.parse.bind(toml),
      },
    });
    if (data.status && data.status !== 'publish' && data.status !== 'archive')
      continue;
    const buildOptions = (data.$build || {}) as BuildOptions;
    delete data.$build;

    // item
    const digest = createHash('sha256').update(rawContent).digest('base64url');
    const itemFull = {
      ...(data.moredata || {}),
      ...data,
      id: digest,
      slug,
      content: minify(content, {
        html5: true,
        decodeEntities: true,
        collapseBooleanAttributes: true,
        collapseWhitespace: true,
        removeAttributeQuotes: true,
        removeComments: true,
        removeOptionalTags: true,
        sortAttributes: true,
        sortClassName: true,
      }),
      moredata: undefined,
    };
    delete itemFull.moredata;
    await outputJson(resolve(destPath, `${digest}.json`), itemFull);
    indexRecord[`${collection}/${slug}`] = digest;

    // collection
    collectionRecord[collection] ||= [];
    const itemForListing = {
      ...data,
      id: digest,
      slug,
      moredata: undefined,
    };
    delete itemForListing.moredata;
    collectionRecord[collection].push(itemForListing);

    // fulltext search
    fulltextSearchRecord[collection] ||= {};
    fulltextSearchRecord[collection][slug] = buildSearchContent(content, data);

    // collect tags
    if (
      buildOptions.collectTags instanceof Object ||
      (data.tags && buildOptions.collectTags !== false)
    ) {
      const {collection = 'tags', field = 'tags'} =
        buildOptions.collectTags || {};
      const [rootField, nestedField] = field.split('.');
      const rawTags = ((!nestedField
        ? data[rootField]
        : data[rootField][nestedField]) || []) as (string | Tag)[];
      if (rawTags.length) {
        collectedTagsRecord[collection] ||= {};
        rawTags.forEach(tag => {
          if (typeof tag !== 'string') {
            collectedTagsRecord[collection][tag.slug] = tag;
          } else {
            const slugMatching = tag.match(/<([\s\S]*?)>/);
            if (!slugMatching) {
              const slug = slugify(tag);
              collectedTagsRecord[collection][slug] = {
                slug,
                title: tag,
              };
            } else {
              const slug = slugMatching[1].trim();
              collectedTagsRecord[collection][slug] = {
                slug,
                title: tag.replace(slugMatching[0], '').trim(),
              };
            }
          }
        });
      }
    }

    // count build
    buildCount++;
  }

  spinner.text = 'Write collections, search and index ...';

  // collections
  for (const [collection, items] of Object.entries(collectionRecord)) {
    const digest = createHash('sha256')
      .update(JSON.stringify(items))
      .digest('base64url');
    await outputJson(resolve(destPath, `${digest}.json`), items);
    indexRecord[collection] = digest;
  }

  // search
  for (const [collection, items] of Object.entries(fulltextSearchRecord)) {
    const digest = createHash('sha256')
      .update(JSON.stringify(items))
      .digest('base64url');
    await outputJson(resolve(destPath, `${digest}.json`), items);
    indexRecord[`${collection}-search`] = digest;
  }

  // tags
  if (Object.keys(collectedTagsRecord).length) {
    for (const [collection, record] of Object.entries(collectedTagsRecord)) {
      const items = Object.values(record);
      const digest = createHash('sha256')
        .update(JSON.stringify(items))
        .digest('base64url');
      await outputJson(resolve(destPath, `${digest}.json`), items);
      indexRecord[collection] = digest;
    }
  }

  // index
  await outputJson(resolve(destPath, 'index.json'), indexRecord);

  // done
  spinner.succeed(
    `Success! Copy ${blueBright(copyPaths.length)} items and build ${blueBright(
      buildCount
    )}/${buildPaths.length} items.\n`
  );
}

function extractTagTitles(
  tags: (string | Object)[] | Record<string, true | string | Object>
) {
  const result = [] as string[];
  if (tags instanceof Array) {
    tags.forEach(tag =>
      result.push(typeof tag === 'string' ? tag : (tag as any).title)
    );
  } else {
    for (const [slug, tag] of Object.entries(tags)) {
      result.push(
        tag === true ? slug : typeof tag === 'string' ? tag : (tag as any).title
      );
    }
  }
  return result;
}

function buildSearchContent(
  htmlContent: string,
  data: Record<string, any> = {}
) {
  let content = '';
  if (data.tags) content += '\n' + extractTagTitles(data.tags).join(' ');
  if (data.title) content += '\n' + data.title;
  if (data.name) content += '\n' + data.name;
  if (data.desc) content += '\n' + data.desc;
  if (data.excerpt) content += '\n' + data.excerpt;
  content +=
    '\n' +
    htmlContent
      .replace(/<style([\s\S]*?)<\/style>/gi, '')
      .replace(/<script([\s\S]*?)<\/script>/gi, '')
      .replace(/<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>/g, '');
  const segmenter = new Intl.Segmenter(['en', 'vi', 'ja'], {
    granularity: 'word',
  });
  const words = Array.from(segmenter.segment(content))
    .map(segment => transliterate(segment.segment))
    .filter(
      word => word && !~'~`!@#$%^&*()+={}[];:\'"<>.,/\\?-_ \t\r\n'.indexOf(word)
    );
  return Array.from(new Set(words)).join(' ');
}
