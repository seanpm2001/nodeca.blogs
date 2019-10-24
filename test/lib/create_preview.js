'use strict';


const assert         = require('assert');
const create_preview = require('nodeca.blogs/lib/create_preview');


function add_test(str) {
  let orig_str = str.replace(/<!--cut-->/, '');

  assert.equal(
    create_preview(orig_str),
    str
  );
}


// generate random text of given length
function text(length) {
  return 'test '.repeat(Math.ceil(length / 5)).substr(0, length);
}


describe('create_preview', function () {
  it('should not put any cuts in short blog posts', function () {
    add_test(`
      <p>${text(10)}</p>
      <p>${text(10)}</p>
      <p>${text(10)}</p>
    `);
  });

  it('should put cut close to 15 lines', function () {
    // paragraph is 4 lines each
    add_test(`
      <p>${text(400)}</p>
      <p>${text(400)}</p>
      <p>${text(400)}</p><!--cut-->
      <p>${text(400)}</p>
      <p>${text(400)}</p>
      <p>${text(400)}</p>
    `);
  });

  it('should put cut after single long paragraph', function () {
    add_test(`
      <p>${text(20 * 120)}</p><!--cut-->
      <p>${text(120)}</p>
      <p>${text(120)}</p>
    `);
  });

  it('should count lines in code blocks correctly', function () {
    add_test(`
      <code>
      ${'q\n'.repeat(10)}
      </code><!--cut-->
      <code>
      ${'q\n'.repeat(10)}
      </code>
    `);
  });

  it('should put cut after 2 pictures', function () {
    add_test(`
      <img class="image">
      <img class="image"><!--cut-->
      <img class="image">
    `);
  });

  it('should put cut after 2 videos', function () {
    add_test(`
      <div class="ez-player ez-block"></div>
      <div class="ez-player ez-block"></div><!--cut-->
      <div class="ez-player ez-block"></div>
    `);
  });

  it('should put cut after 2 attaches', function () {
    add_test(`
      <a class="attach"></a>
      <a class="attach"></a><!--cut-->
      <a class="attach"></a>
    `);
  });

  it('should count text inside nested tags', function () {
    // paragraph is 4 lines each
    add_test(`
      <p>test <div>test <em>${text(120 * 15)}</em><br> test</div> </p><!--cut-->
      <p>${text(400)}</p>
    `);
  });
});