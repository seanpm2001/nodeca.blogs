'use strict';


const assert         = require('assert');
const create_preview = require('nodeca.blogs/lib/create_preview');


function add_test(str) {
  let orig_str = str.replace(/<!--cut-->\n?/, '');
  let p = create_preview(orig_str);

  assert.strictEqual(p.html, str);
  assert.strictEqual(p.top_too_heavy, false);
  assert.strictEqual(p.user_cut_too_large, false);
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
<p>${text(400)}</p>
<!--cut-->
<p>${text(400)}</p>
<p>${text(400)}</p>
<p>${text(400)}</p>
    `);
  });

  it('should put cut after single long paragraph', function () {
    add_test(`
<p>${text(20 * 120)}</p>
<!--cut-->
<p>${text(120)}</p>
<p>${text(120)}</p>
    `);
  });

  it('should count lines in code blocks correctly', function () {
    add_test(`
<code>
${'q\n'.repeat(10)}
</code>
<!--cut-->
<code>
${'q\n'.repeat(10)}
</code>
    `);
  });

  it('should put cut after 2 pictures', function () {
    add_test(`
<img class="image">
<img class="image">
<!--cut-->
<img class="image">
    `);
  });

  it('should put cut after 2 wrapped pictures', function () {
    add_test(`
<span class="image" style="width: 100px" data-nd-orig="http://example.com/image.png">
  <img src="http://example.com/image.png">
  <span class="image__spacer" style="padding-bottom: 50%"></span>
</span>
<span class="image" style="width: 100px" data-nd-orig="http://example.com/image.png">
  <img src="http://example.com/image.png">
  <span class="image__spacer" style="padding-bottom: 50%"></span>
</span>
<!--cut-->
<span class="image" style="width: 100px" data-nd-orig="http://example.com/image.png">
  <img src="http://example.com/image.png">
  <span class="image__spacer" style="padding-bottom: 50%"></span>
</span>
    `);
  });

  it('should put cut after 2 videos', function () {
    add_test(`
<div class="ez-player ez-block"></div>
<div class="ez-player ez-block"></div>
<!--cut-->
<div class="ez-player ez-block"></div>
    `);
  });

  it('should put cut after 2 attaches', function () {
    add_test(`
<a class="attach"></a>
<a class="attach"></a>
<!--cut-->
<a class="attach"></a>
    `);
  });

  it('should count text inside nested tags', function () {
    // paragraph is 4 lines each
    add_test(`
<p>test <div>test <em>${text(120 * 15)}</em><br> test</div> </p>
<!--cut-->
<p>${text(400)}</p>
    `);
  });

  it('should replace user preview at the start with autogenerated', function () {
    assert.strictEqual(
      create_preview(`<!--cut-->
<p>${text(400)}</p>
<p>${text(400)}</p>
<p>${text(400)}</p>
<p>${text(400)}</p>
`).html, `<p>${text(400)}</p>
<p>${text(400)}</p>
<p>${text(400)}</p>
<!--cut-->
<p>${text(400)}</p>
`
    );
  });

  it('should remove user preview at the end', function () {
    assert.strictEqual(
      create_preview(`
<p>${text(10)}</p>
<p>${text(10)}</p>
<p>${text(10)}</p>
<!--cut-->
`).html, `
<p>${text(10)}</p>
<p>${text(10)}</p>
<p>${text(10)}</p>
`
    );
  });

  it('should replace user cut with auto cut + warning', function () {
    let p = create_preview(`<p>${text(400)}</p>
<p>${text(400)}</p>
<p>${text(400)}</p>
<p>${text(400)}</p>
<!--cut-->
<p>${text(400)}</p>
`);
    assert.strictEqual(p.html, `<p>${text(400)}</p>
<p>${text(400)}</p>
<p>${text(400)}</p>
<!--cut-->
<p>${text(400)}</p>
<p>${text(400)}</p>
`);
    assert.strictEqual(p.user_cut_too_large, true);
  });

  it('should warn about multiple images at the top', function () {
    let p;
    p = create_preview('<p><img class="image"><img class="image"></p>');
    assert.strictEqual(p.top_too_heavy, false);
    p = create_preview('<p><img class="image"><img class="image"><img class="image"></p>');
    assert.strictEqual(p.top_too_heavy, true);
  });
});