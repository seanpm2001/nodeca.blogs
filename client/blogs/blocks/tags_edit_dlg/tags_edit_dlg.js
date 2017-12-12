// Edit tags
//
'use strict';


const _ = require('lodash');

let $dialog;
let result;


// Init dialog
//
N.wire.on(module.apiPath, function show_dialog(data) {
  $dialog = $(N.runtime.render(module.apiPath, _.assign({ apiPath: module.apiPath }, data)));
  $('body').append($dialog);

  return new Promise((resolve, reject) => {
    $dialog
      .on('shown.bs.modal', function () {
        $dialog.find('.btn-secondary').focus();
      })
      .on('hidden.bs.modal', function () {
        // When dialog closes - remove it from body and free resources.
        $dialog.remove();
        $dialog = null;

        if (!result) return reject('CANCELED');

        data.tags = result.tags.split(',').map(s => s.trim()).filter(Boolean);
        resolve();
      })
      .modal('show');
  });
});


// Submit button handler
//
N.wire.on(module.apiPath + ':submit', function submit_dialog(data) {
  result = data.fields;
  $dialog.modal('hide');
});


// Close dialog on sudden page exit (if user click back button in browser)
//
N.wire.on('navigate.exit', function teardown_page() {
  if ($dialog) {
    $dialog.modal('hide');
  }
});