'use strict';


// Page state
//
// - first_offset:       offset of the first entry in the DOM
// - current_offset:     offset of the current entry (first in the viewport)
// - reached_start:      true if no more pages exist above first loaded one
// - reached_end:        true if no more pages exist below last loaded one
// - prev_loading_start: time when current xhr request for the previous page is started
// - next_loading_start: time when current xhr request for the next page is started
// - entry_count:        total amount of entries
// - top_marker:         first entry id (for prefetch)
// - bottom_marker:      last entry id (for prefetch)
//
let pageState = {};

let $window = $(window);

// whenever there are more than 150 entries, cut off-screen entries down to 100
const CUT_ITEMS_MAX = 150;
const CUT_ITEMS_MIN = 100;


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup() {
  let pagination     = N.runtime.page_data.pagination,
      last_entry_hid = $('.blogs-index').data('last-entry-hid');

  pageState.first_offset       = pagination.chunk_offset;
  pageState.current_offset     = -1;
  pageState.entry_count        = pagination.total;
  pageState.reached_start      = pageState.first_offset === 0;
  pageState.reached_end        = last_entry_hid === $('.blogs-index__entry-list > :last').data('entry-hid');
  pageState.prev_loading_start = 0;
  pageState.next_loading_start = 0;
  pageState.top_marker         = $('.blogs-index').data('top-marker');
  pageState.bottom_marker      = $('.blogs-index').data('bottom-marker');
});


// Show/hide loading placeholders when new entries are fetched,
// adjust scroll when adding/removing top placeholder
//
function reset_loading_placeholders() {
  let prev = $('.blogs-index__loading-prev');
  let next = $('.blogs-index__loading-next');

  // if topmost entry is loaded, hide top placeholder
  if (pageState.reached_start) {
    if (!prev.hasClass('hidden-xs-up')) {
      $window.scrollTop($window.scrollTop() - prev.outerHeight(true));
      prev.addClass('hidden-xs-up');
    }

  } else {
    /* eslint-disable no-lonely-if */
    if (prev.hasClass('hidden-xs-up')) {
      prev.removeClass('hidden-xs-up');
      $window.scrollTop($window.scrollTop() + prev.outerHeight(true));
    }
  }

  // if last entry is loaded, hide bottom placeholder
  if (pageState.reached_end) {
    next.addClass('hidden-xs-up');
  } else {
    next.removeClass('hidden-xs-up');
  }
}


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function blogs_index_init_handlers() {

  ///////////////////////////////////////////////////////////////////////////
  // Whenever we are close to beginning/end of entry list, check if we can
  // load more pages from the server
  //

  // an amount of entries we try to load when user scrolls to the end of the page
  const LOAD_ENTRIES_COUNT = N.runtime.page_data.pagination.per_page;

  // A delay after failed xhr request (delay between successful requests
  // is set with affix `throttle` argument)
  //
  // For example, suppose user continuously scrolls. If server is up, each
  // subsequent request will be sent each 100 ms. If server goes down, the
  // interval between request initiations goes up to 2000 ms.
  //
  const LOAD_AFTER_ERROR = 2000;

  N.wire.on(module.apiPath + ':load_prev', function load_prev_page() {
    if (pageState.reached_start) return;

    let last_entry_id = pageState.top_marker;

    // No entries on the page
    if (!last_entry_id) return;

    let now = Date.now();

    // `prev_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(pageState.prev_loading_start - now) < LOAD_AFTER_ERROR) return;

    pageState.prev_loading_start = now;

    N.io.rpc('blogs.index.list.by_range', {
      start:    last_entry_id,
      before:   LOAD_ENTRIES_COUNT,
      after:    0
    }).then(res => {
      if (!res.entries) return;

      if (res.entries.length !== LOAD_ENTRIES_COUNT) {
        pageState.reached_start = true;
        reset_loading_placeholders();
      }

      if (res.entries.length === 0) return;

      pageState.top_marker = res.entries[0]._id;

      // update prev/next metadata
      $('link[rel="prev"]').remove();

      if (res.head.prev) {
        let link = $('<link rel="prev">');

        link.attr('href', res.head.prev);
        $('head').append(link);
      }

      let old_height = $('.blogs-index__entry-list').height();

      // render & inject topics list
      let $result = $(N.runtime.render('blogs.blocks.entry_list_mixed', res));

      return N.wire.emit('navigate.update', {
        $:       $result,
        locals:  res,
        $before: $('.blogs-index__entry-list > :first')
      }).then(() => {
        // update scroll so it would point at the same spot as before
        $window.scrollTop($window.scrollTop() + $('.blogs-index__entry-list').height() - old_height);

        //
        // Limit total amount of posts in DOM
        //
        let entries   = document.getElementsByClassName('blogs-entry-mixed');
        let cut_count = entries.length - CUT_ITEMS_MIN;

        if (cut_count > CUT_ITEMS_MAX - CUT_ITEMS_MIN) {
          let entry = entries[entries.length - cut_count - 1];

          // This condition is a safeguard to prevent infinite loop,
          // which happens if we remove a post on the screen and trigger
          // prefetch in the opposite direction (test it with
          // CUT_ITEMS_MAX=10, CUT_ITEMS_MIN=0)
          if (entry.getBoundingClientRect().top > $window.height() + 600) {
            $(entry).nextAll().remove();

            // Update range for the next time we'll be doing prefetch
            pageState.bottom_marker = $('.blogs-entry-mixed:last').data('entry-id');

            pageState.reached_end = false;
            reset_loading_placeholders();
          }
        }

        // reset lock
        pageState.prev_loading_start = 0;
      });
    }).catch(err => {
      N.wire.emit('error', err);
    });
  });


  N.wire.on(module.apiPath + ':load_next', function load_next_page() {
    if (pageState.reached_end) return;

    let last_entry_id = pageState.bottom_marker;

    // No entries on the page
    if (!last_entry_id) return;

    let now = Date.now();

    // `next_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(pageState.next_loading_start - now) < LOAD_AFTER_ERROR) return;

    pageState.next_loading_start = now;

    N.io.rpc('blogs.index.list.by_range', {
      start:    last_entry_id,
      before:   0,
      after:    LOAD_ENTRIES_COUNT
    }).then(res => {
      if (!res.entries) return;

      if (res.entries.length !== LOAD_ENTRIES_COUNT) {
        pageState.reached_end = true;
        reset_loading_placeholders();
      }

      if (res.entries.length === 0) return;

      pageState.bottom_marker = res.entries[res.entries.length - 1]._id;

      // update prev/next metadata
      $('link[rel="next"]').remove();

      if (res.head.next) {
        let link = $('<link rel="next">');

        link.attr('href', res.head.next);
        $('head').append(link);
      }

      // render & inject topics list
      let $result = $(N.runtime.render('blogs.blocks.entry_list_mixed', res));

      return N.wire.emit('navigate.update', {
        $:      $result,
        locals: res,
        $after: $('.blogs-index__entry-list > :last')
      }).then(() => {
        //
        // Limit total amount of posts in DOM
        //
        let entries   = document.getElementsByClassName('blogs-entry-mixed');
        let cut_count = entries.length - CUT_ITEMS_MIN;

        if (cut_count > CUT_ITEMS_MAX - CUT_ITEMS_MIN) {
          let entry = entries[cut_count];

          // This condition is a safeguard to prevent infinite loop,
          // which happens if we remove a post on the screen and trigger
          // prefetch in the opposite direction (test it with
          // CUT_ITEMS_MAX=10, CUT_ITEMS_MIN=0)
          if (entry.getBoundingClientRect().bottom < -600) {
            let old_height = $('.blogs-index__entry-list').height();
            let old_scroll = $window.scrollTop(); // might change on remove()
            let old_length = entries.length;

            $(entry).prevAll().remove();

            // Update range for the next time we'll be doing prefetch
            pageState.top_marker = $('.blogs-entry-mixed:first').data('entry-id');

            // update scroll so it would point at the same spot as before
            $window.scrollTop(old_scroll + $('.blogs-index__entry-list').height() - old_height);
            pageState.first_offset += old_length - document.getElementsByClassName('blogs-entry-mixed').length;

            pageState.reached_start = false;
            reset_loading_placeholders();
          }
        }

        // reset lock
        pageState.next_loading_start = 0;
      });
    }).catch(err => {
      N.wire.emit('error', err);
    });
  });


  // User presses "home" button
  //
  N.wire.on(module.apiPath + ':nav_to_start', function navigate_to_start() {
    // if the first entry is already loaded, scroll to the top
    if (pageState.reached_start) {
      $window.scrollTop(0);
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'blogs.index',
      params:  {}
    });
  });


  // User presses "end" button
  //
  N.wire.on(module.apiPath + ':nav_to_end', function navigate_to_end() {
    // if the last entry is already loaded, scroll to the bottom
    if (pageState.reached_end) {
      $window.scrollTop($(document).height());
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'blogs.index',
      params: {
        $query: { from: String($('.blogs-index').data('last-entry-hid')) }
      }
    });
  });
});