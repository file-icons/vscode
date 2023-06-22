Adding a new icon
=================

Please [submit a request][1] to the `file-icons/icons` repository. Make sure the
icon isn't already included in one of the other icon-fonts first:

* [**Devicons**](https://github.com/file-icons/DevOpicons/blob/master/charmap.md)
* [**Mfizz**](https://github.com/file-icons/MFixx/blob/master/charmap.md)
* [**Octicons**](https://octicons.github.com/)


Adding support for a new filetype
=================================

This package pulls its icon-to-filetype mappings from the [`file-icons/atom`][2]
repository using an [update script][3]. The `*-icon-theme.json` files themselves
are auto-generated and shouldn't be edited by hand. Please add new extensions to
the upstream [`config.cson`][4] file instead.

If `config.cson` already lists the desired extension, then it's likely a problem
with the [update script][3]. See below.


Fixing a missing filetype
=========================

The [update script][3] is unable to generate filetype mappings for patterns with
an indefinite number of variants, such as `/^foo(.*)\.bar/`. In cases like this,
a workaround is to add a new entry to [`import-fixes.json`][5]:

~~~json
"_icon-name_colour-name": [
	"filetype1",
	"filetype2"
]
~~~

A caveat of this solution is that only fixed-length strings can be added; a more
intuitive system for icon-mapping will eventually be developed in the future.


<!-- Referenced links -->
[1]: https://github.com/file-icons/icons/issues/new
[2]: https://github.com/file-icons/atom
[3]: ./scripts/update.mjs
[4]: https://github.com/file-icons/atom/blob/master/config.cson
[5]: ./scripts/import-fixes.json
