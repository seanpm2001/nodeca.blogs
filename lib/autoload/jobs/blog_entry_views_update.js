// Flush view counters from `views:blog_entry:count` in redis
// to `BlogEntry.views` in mongo.
//
'use strict';


const _        = require('lodash');
const ObjectId = require('mongoose').Types.ObjectId;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_blog_entry_views_update() {
    const task_name = 'blog_entry_views_update';

    if (!N.config.cron || !N.config.cron[task_name]) {
      return new Error(`No config defined for cron task "${task_name}"`);
    }

    N.queue.registerTask({
      name: task_name,
      pool: 'hard',
      cron: N.config.cron[task_name],
      async process() {
        try {
          //
          // Flush views
          //

          // rename key first to avoid race conditions
          try {
            await N.redis.renameAsync('views:blog_entry:count', 'views:blog_entry:count_tmp');
          } catch (__) {}

          let items = await N.redis.hgetallAsync('views:blog_entry:count_tmp');

          await N.redis.delAsync('views:blog_entry:count_tmp');

          if (!_.isEmpty(items)) {
            let bulk = N.models.blogs.BlogEntry.collection.initializeUnorderedBulkOp();

            Object.keys(items).forEach(function (id) {
              bulk.find({ _id: new ObjectId(id) })
                  .updateOne({ $inc: { views: Number(items[id]) } });
            });

            await bulk.execute();
          }

          //
          // Cleanup visited
          //
          let time = await N.redis.timeAsync();
          let score = Math.floor(time[0] * 1000 + time[1] / 1000);

          // decrease counter by 10 min
          score -= 10 * 60 * 1000;

          await N.redis.zremrangebyscoreAsync('views:blog_entry:track_last', '-inf', score);
        } catch (err) {
          // don't propagate errors because we don't need automatic reloading
          N.logger.error('"%s" job error: %s', task_name, err.message || err);
        }
      }
    });
  });
};