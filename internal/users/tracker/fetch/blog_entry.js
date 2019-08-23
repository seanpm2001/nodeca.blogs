// Fetch blog entries for tracker
//
// In:
//
//  - params.user_info
//  - params.subscriptions
//  - params.start (optional) - last last_ts from previous page
//  - params.limit - max number of entries, 0 means return count only
//
// Out:
//  - count
//  - items - { type, last_ts, id }
//  - next  - last last_ts (contents of params.start for the next page),
//            null if last page
//  - users - merged with env.data.users
//  - res   - misc data (specific to template, merged with env.res)
//

'use strict';


const ObjectId       = require('mongoose').Types.ObjectId;
const _              = require('lodash');
const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function tracker_fetch_entries(locals) {
    locals.res = {};

    let entry_subs = _.filter(locals.params.subscriptions, { to_type: N.shared.content_type.BLOG_ENTRY });
    let blog_subs = _.filter(locals.params.subscriptions, { to_type: N.shared.content_type.BLOG_SOLE });

    let content_read_marks_expire = await N.settings.get('content_read_marks_expire');
    let min_cut = new Date(Date.now() - (content_read_marks_expire * 24 * 60 * 60 * 1000));

    let can_see_hellbanned = await N.settings.get('can_see_hellbanned', {
      user_id: locals.params.user_info.user_id,
      usergroup_ids: locals.params.user_info.usergroups
    }, {});

    let cache = locals.params.user_info.hb || can_see_hellbanned ? 'cache_hb' : 'cache';

    // Fetch entries by entry subscriptions
    //
    let entries = [];

    if (entry_subs.length !== 0) {
      entries = await N.models.blogs.BlogEntry.find()
                          .where('_id').in(_.map(entry_subs, 'to'))
                          .where(cache + '.last_ts').gt(min_cut)
                          .lean(true);
    }


    // Fetch entries by blog subscriptions
    //
    if (blog_subs.length !== 0) {
      let cuts = await N.models.users.Marker.cuts(locals.params.user_info.user_id, _.map(blog_subs, 'to'));
      let queryParts = [];

      _.forEach(cuts, (cutTs, id) => {
        queryParts.push({ user: id, _id: { $gt: new ObjectId(Math.round(cutTs / 1000)) } });
      });

      entries = entries.concat(await N.models.blogs.BlogEntry.find({ $or: queryParts }).lean(true) || []);
      entries = _.uniqBy(entries, entry => String(entry._id));
    }


    // Fetch read marks
    //
    let data = entries.map(entry => ({
      categoryId: entry.user,
      contentId: entry._id,
      lastPostNumber: entry[cache].last_comment_hid,
      lastPostTs: entry[cache].last_ts
    }));

    let read_marks = await N.models.users.Marker.info(locals.params.user_info.user_id, data);


    // Filter new and unread entries
    entries = entries.filter(entry => read_marks[entry._id].isNew || read_marks[entry._id].next !== -1);


    // Check permissions subcall
    //
    let access_env = { params: {
      entries,
      user_info: locals.params.user_info
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    entries = entries.filter((__, idx) => access_env.data.access_read[idx]);


    // Remove entries created by ignored users (except for subscribed ones)
    //
    let entry_subs_by_id = _.keyBy(entry_subs, 'to');

    let first_users = entries.map(entry => entry.user).filter(Boolean);

    let ignored = _.keyBy(
      await N.models.users.Ignore.find()
                .where('from').equals(locals.params.user_info.user_id)
                .where('to').in(first_users)
                .select('from to -_id')
                .lean(true),
      'to'
    );

    entries = entries.filter(entry => {
      // Topic starter is ignored, and topic is not subscribed to
      if (ignored[entry.user] && !entry_subs_by_id[entry._id]) {
        return false;
      }

      // Last poster is ignored, and there is only one unread message
      // (topic still shows up if ignored user leaves multiple messages)
      if (ignored[_.get(entry, cache + '.last_user')] &&
          read_marks[entry._id].position >= _.get(entry, cache + '.last_comment_hid') - 1) {

        return false;
      }

      return true;
    });


    let items = [];

    entries.forEach(entry => {
      items.push({
        type: 'blog_entry',
        last_ts: entry[cache].last_ts || entry.ts,
        id: String(entry._id)
      });
    });

    locals.count = items.length;

    if (locals.params.limit > 0) {
      if (locals.params.start) items = items.filter(item => item.last_ts.valueOf() < locals.params.start);

      let items_sorted = _.orderBy(items, 'last_ts', 'desc');
      let items_on_page = items_sorted.slice(0, locals.params.limit);

      locals.items = items_on_page;
      locals.next = items_sorted.length > items_on_page.length ?
                    items_on_page[items_on_page.length - 1].last_ts.valueOf() :
                    null;

      // Filter only topics that are on this page
      //
      let entry_ids = new Set();
      for (let { id } of items_on_page) entry_ids.add(id);
      entries = entries.filter(entry => entry_ids.has(String(entry._id)));

      // Sanitize entries, replace cache with cache_hb if needed
      //
      entries = await sanitize_entry(N, entries, locals.params.user_info);
      locals.res.blog_entries = _.keyBy(entries, '_id');

      // Collect user ids
      //
      locals.users = locals.users || [];
      locals.users = locals.users.concat(_.map(entries, 'user'));
      locals.users = locals.users.concat(_.map(entries, 'cache.last_user').filter(Boolean));

      locals.res.read_marks = {};
      for (let id of entry_ids) locals.res.read_marks[id] = read_marks[id];
    }
  });
};
