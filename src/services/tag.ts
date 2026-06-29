import type { Tag, TagRepository } from '../repositories/tag';

export type CreateTagResult = {
  tag: Tag;
  created: boolean;
};

export type TagService = {
  list: () => Promise<Tag[]>;
  create: (name: string) => Promise<CreateTagResult>;
};

export function createTagService(tagRepo: TagRepository): TagService {
  return {
    async list() {
      return tagRepo.list();
    },
    async create(name) {
      return tagRepo.createIfNotExists(name);
    },
  };
}
