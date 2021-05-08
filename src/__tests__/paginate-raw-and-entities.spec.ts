import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, TypeOrmModule } from '@nestjs/typeorm';
import { Connection, QueryRunner, SelectQueryBuilder } from 'typeorm';
import { paginateRawAndEntities } from '../paginate';
import { Pagination } from '../pagination';
import { TestEntity } from './test.entity';

describe('Test paginateRawAndEntities function', () => {
  const TEST_ROUTE = 'https://testing.this/api/v1';
  const RAW_ID_LABEL = 't_id';
  const RAW_SUM_LABEL = 'sum';

  let app: TestingModule;
  let connection: Connection;
  let runner: QueryRunner;
  let queryBuilder: SelectQueryBuilder<TestEntity>;

  let results: Pagination<TestEntity>;
  let rawResults: Partial<TestEntity>[];

  const totalItems = 10;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          entities: [TestEntity],
          host: 'localhost',
          port: 3306,
          type: 'mysql',
          username: 'test',
          password: '',
          database: 'test',
          dropSchema: true,
          synchronize: true,
        }),
      ],
    }).compile();
    connection = app.get(getConnectionToken());
    runner = connection.createQueryRunner();
    await runner.startTransaction();

    queryBuilder = runner.manager.createQueryBuilder(TestEntity, 't');

    // Insert some registries on database
    for (let i = 1; i <= totalItems; i++) {
      await queryBuilder
        .insert()
        .into(TestEntity)
        .values({
          id: i,
        })
        .execute();
    }
  });

  afterAll(() => {
    runner.rollbackTransaction();
    app.close();
  });

  describe.each([
    [
      { limit: 10, page: 1 },
      {
        itemCount: 10,
        totalItems: 10,
        itemsPerPage: 10,
        totalPages: 1,
        currentPage: 1,
      },
      {
        first: `${TEST_ROUTE}?limit=10`,
        previous: '',
        next: '',
        last: `${TEST_ROUTE}?page=1&limit=10`,
      },
    ],
    [
      { limit: 3, page: 2 },
      {
        itemCount: 3,
        totalItems: 10,
        itemsPerPage: 3,
        totalPages: 4,
        currentPage: 2,
      },
      {
        first: `${TEST_ROUTE}?limit=3`,
        previous: `${TEST_ROUTE}?page=1&limit=3`,
        next: `${TEST_ROUTE}?page=3&limit=3`,
        last: `${TEST_ROUTE}?page=4&limit=3`,
      },
    ],
  ])(
    'For options \n%j\n should return meta \n%j\n and links \n%j',
    (options, meta, links) => {
      beforeAll(async () => {
        queryBuilder.addSelect('SUM(t.id)', RAW_SUM_LABEL).groupBy('t.id');

        [results, rawResults] = await paginateRawAndEntities(queryBuilder, {
          ...options,
          route: TEST_ROUTE,
        });
      });

      it('can call method and get results', () => {
        expect(results).toBeInstanceOf(Pagination);
      });

      it('shows correct meta object', () => {
        expect(results.meta).toStrictEqual(meta);
      });

      it('shows correct links object', () => {
        expect(results.links).toStrictEqual(links);
      });

      it('gets items and raw items', async () => {
        expect(results.items[0]).toBeInstanceOf(TestEntity);
        expect(Object.keys(rawResults[0])).toEqual(
          expect.arrayContaining([
            RAW_ID_LABEL.replace('.', '_'),
            RAW_SUM_LABEL,
          ]),
        );
      });
    },
  );
});
