// Create new blog entry
//

'use strict';

const _ = require('lodash');


let options;


function updateOptions() {
  N.MDEdit.parseOptions(_.assign({}, options.parse_options, {
    link_to_title:   options.user_settings.no_mlinks         ? false : options.parse_options.link_to_title,
    link_to_snippet: options.user_settings.no_mlinks         ? false : options.parse_options.link_to_snippet,
    quote_collapse:  options.user_settings.no_quote_collapse ? false : options.parse_options.quote_collapse,
    emoji:           options.user_settings.no_emojis         ? false : options.parse_options.emoji
  }));
}


// Load mdedit
//
N.wire.before(module.apiPath + ':begin', function load_mdedit() {
  return N.loader.loadAssets('mdedit');
});


// Fetch options
//
N.wire.before(module.apiPath + ':begin', function fetch_options() {
  return N.io.rpc('blogs.options').then(opt => {
    options = {
      parse_options: opt.parse_options,
      user_settings: {
        no_mlinks:         false,
        no_emojis:         false,
        no_quote_collapse: false
      }
    };
  });
});


// Show editor and add handlers for editor events
//
N.wire.on(module.apiPath + ':begin', function show_editor() {
  let $editor = N.MDEdit.show({
    draftKey: [ 'blog_entry_create', N.runtime.user_hid ].join('_'),
    draftCustomFields: {
      '.blog-entry-create__title': 'input'
    }
  });

  updateOptions();

  $editor
    .on('show.nd.mdedit', () => {
      let title = t('create_blog_entry');

      $editor.find('.mdedit-header__caption').html(title);
      $editor.find('.mdedit-header').append(N.runtime.render(module.apiPath + '.title_input'));
      $editor.find('.mdedit-footer').append(N.runtime.render(module.apiPath + '.options_btn'));
    })
    .on('submit.nd.mdedit', () => {
      $editor.find('.mdedit-btn__submit').addClass('disabled');

      let params = {
        title:                    $('.blog-entry-create__title').val(),
        txt:                      N.MDEdit.text(),
        attach:                   _.map(N.MDEdit.attachments(), 'media_id'),
        option_no_mlinks:         options.user_settings.no_mlinks,
        option_no_emojis:         options.user_settings.no_emojis,
        option_no_quote_collapse: options.user_settings.no_quote_collapse
      };

      N.io.rpc('blogs.entry.create', params).then(response => {
        N.MDEdit.hide({ removeDraft: true });
        N.wire.emit('navigate.to', {
          apiPath: 'blogs.entry',
          params: {
            user_hid:  N.runtime.user_hid,
            entry_hid: response.entry_hid
          }
        });
      }).catch(err => {
        $editor.find('.mdedit-btn__submit').removeClass('disabled');
        N.wire.emit('error', err);
      });

      return false;
    });
});


// Open options dialog
//
N.wire.on(module.apiPath + ':options', function show_options_dlg() {
  return N.wire.emit('common.blocks.editor_options_dlg', options.user_settings).then(updateOptions);
});
