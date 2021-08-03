#!/usr/bin/env/ node
/******************************************************************************
  Copyright (c) 2020 Cisco and/or its affiliates.

  This software is licensed to you under the terms of the Cisco Sample
  Code License, Version 1.0 (the "License"). You may obtain a copy of the
  License at

                https://developer.cisco.com/docs/licenses

  All use of the material herein must be in accordance with the terms of
  the License. All rights not expressly granted by the License are
  reserved. Unless required by applicable law or agreed to separately in
  writing, software distributed under the License is distributed on an "AS
  IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
  or implied.
******************************************************************************/

/******************************************************************************

  Merges all the XMind files from a source directory into one master workbook

******************************************************************************/

// Required modules
var fs = require('fs');
var JSZip = require('jszip');
var lod = require('lodash');
var tmp = require('tmp');
var path = require('path');
const { v4: uuidv4 } = require('uuid');
var args = require('yargs')
    .usage('Usage: $0 [options]')
    .boolean('debug')
    .describe('debug', 'Run in debug mode')
    .boolean('fold')
    .describe('fold', 'Fold the merged XMind tree')
    .boolean('src_attr')
    .describe('src_attr', 'Add a source file attribution note to each top-level topic in the merged tree, or to every topic if a deeper merge is performed')
    .boolean('deeper')
    .describe('deeper', 'Perform a deeper merge, consolidating matching top-level topics')
    .boolean('sort_topics')
    .describe('sort_topics', 'Sort the merged XMind tree by topic instead of by source filename')
    .nargs('src_dir', 1)
    .describe('src_dir', 'The source directory with XMind files to merge')
    .nargs('dst_xmind', 1)
    .describe('dst_xmind', 'The new XMind file to merge into')
    .demandOption(['src_dir', 'dst_xmind'])
    .argv;

// Constants
const SUFFIX = '.xmind';
const CONTENT_FILE = 'content.json';
const MANIFEST_FILE = 'manifest.json';
const OTHER_FILES = ['content.xml', 'metadata.json'];
const TEMPLATE_DIR = path.join(__dirname, '/template/');
const RESOURCES_DIR = 'resources/';
const TEMP_RESOURCES_DIR = tmp.dirSync().name;
const ROOT_TOPIC = 'rootTopic';
const SRC_ATTR_TAG = 'Merge-Source: ';

// Set up processing for exit signals
process.on('SIGINT', cleanUp);
process.on('SIGTERM', cleanUp);

// Clean up on exit
function cleanUp() {
  console.log('Received quit signal');
  process.exit();
}

// DEBUG
if(args.debug) {
  console.log('Debug mode activated');
}

// Scan the source directory
process.stdout.write('Scanning source directory \'' + args.src_dir + '\' ... ');
try {
  var src_filenames = fs.readdirSync(args.src_dir);
}
catch(error) {
  // Some kind of issue reading the source directory, quit
  console.log('Error (' + error.message + ')');
  process.exit();
}

// Filter out '.xmind' files
var src_xminds = new Array();
src_filenames.forEach((filename) => {
  if(filename.endsWith(SUFFIX)) {
    src_xminds.push(filename);
  }
});

if(src_xminds.length === 0) {
  // No XMind files found in the source directory, quit
  console.log('Error (No ' + SUFFIX + ' files found)');
  process.exit();
}

// Found at least one XMind source files, sort them alphabetically
src_xminds.sort();
console.log('Done (Found ' + src_xminds.length + ' .xmind files to merge)');

// DEBUG
if(args.debug) {
  console.log('Source Files:');
  console.log(src_xminds);
}

process.stdout.write('Loading template ... ');
try {
  var dst_xmind = JSON.parse(fs.readFileSync(TEMPLATE_DIR + CONTENT_FILE));
}
catch(error) {
  console.log('Error (' + error.message + ')');
  process.exit();
}
console.log('Done');
var dst_resources = {};

// Add recursive object/array mapValues processing to Lodash
lod.mixin({
  deeply: function(map) {
    return function(obj, fn) {
      return map(lod.mapValues(obj, function(v) {
        return lod.isPlainObject(v) ? lod.deeply(map)(v, fn) : lod.isArray(v) ? v.map(function(x) {
          return lod.deeply(map)(x, fn);
        }) : v;
      }), fn);
    }
  },
});

// Loop through each source XMind adding its content and keeping track of any errors
process.stdout.write('Processing files ');
var src_errors = new Array();
var i = 0;
src_xminds.forEach((src_xmind) => {
  // Read in the raw file data (zip)
  try {
    var src_data = fs.readFileSync(args.src_dir + src_xmind);
  }
  catch(error) {
    // Unable to read the raw file data
    process.stdout.write('x');
    src_errors.push('Error reading \'' + src_xmind + '\': ' + error.message);
    i++;
  }
  if(src_data) {
    // Parse the file data as a zip file
    JSZip.loadAsync(src_data).then((src_zip) => {
      // Search for the content file in the zip
      var src_content = src_zip.file(CONTENT_FILE);
      if(src_content) {
        // Extract the content from the content file as a string
        src_content.async('string').then((src_json) => {
          // Merge the content and write out the status
          process.stdout.write(merge_content(src_json, src_xmind, src_zip));
          i++;
        }, (error) => {
          // Unable to get the string content from the content file
          process.stdout.write('x');
          src_errors.push('Error parsing \'' + src_xmind + '\' content file: ' + error.message);
          i++;
        }).then(check_done_load);
      }
      else {
        // Unable to find the content file in the zip
        process.stdout.write('x');
        src_errors.push('Content file not found in \'' + src_xmind + '\', skipping');
        i++;
      }
    }, (error) => {
      // Unable to parse the file data as a zip file
      process.stdout.write('x');
      src_errors.push('Error reading \'' + src_xmind + '\' as zip: ' + error.message);
      i++;
    }).then(check_done_load);
  }
});


// Check if the file loading process is done and print status, including
// the error list if necessary, then save the results
async function check_done_load() {
  if(i === src_xminds.length) {
    i = 0;
    await check_resources_saved();
    process.stdout.write(' Done (');
    if(src_errors.length > 0) {
      console.log('Errors)')
      console.log('\nError Log:');
      src_errors.forEach((message) => {
        console.log(message);
      });
    }
    else {
      console.log('No errors)');
    }

    // DEBUG
    if(args.debug) {
      console.log('\nMerged JSON:');
      console.log(JSON.stringify(dst_xmind));
    }

    // Consolidate top-level topics if necessary
    if(args.deeper) {
      process.stdout.write('Consolidating matching top-level topics ... ');
      var consolidation_count = consolidate_xmind();
      console.log('Done (' + consolidation_count + ' matches)');
    }

    // Sort topics if necessary
    if(args.sort_topics) {
      process.stdout.write('Sorting topics ... ');
      sort_topics();
      console.log('Done');
    }
    
    // Fold the result if necessary
    if(args.fold) {
      process.stdout.write('Folding top-level topics ... ');
      fold_xmind();
      console.log('Done');
    }

    // Save the results
    save_results();
  }
}


// Check that all the resource files have been saved and wait until they are
// ready
function check_resources_saved() {
  return new Promise(resolve => {
    var save_check = setInterval(() => {
      if(!lod.includes(dst_resources, 'saving')) {
        clearInterval(save_check);
        resolve();
      }
    }, 500);
  });
}


// Write and save the resulting XMind file
function save_results() {
  // Create an in-memory zip archive
  process.stdout.write('Writing merged data ... ');
  var dst_zip = new JSZip();

  // Create and add the manifest file along with any saved resources
  var dst_manifest = {
    'file-entries': {
      'content.json': {},
      'metadata.json': {}
    }
  };
  lod.forEach(dst_resources, (status, resource) => {
    try {
      dst_zip.file(RESOURCES_DIR + resource, fs.readFileSync(path.join(TEMP_RESOURCES_DIR, resource)));
      dst_manifest['file-entries'][RESOURCES_DIR + resource] = {};
      fs.unlinkSync(path.join(TEMP_RESOURCES_DIR, resource));
    }
    catch(error) {
      console.log('Error: (' + error.message + ')');
    }
  });
  dst_zip.file(MANIFEST_FILE, JSON.stringify(dst_manifest));

  // Add the 'other' files from the template dir (see above for what these are)
  OTHER_FILES.forEach((fn) => {
    try {
      dst_zip.file(fn, fs.readFileSync(TEMPLATE_DIR + fn));
    }
    catch(error) {
      console.log('Error (' + error.message + ')');
      process.exit();
    }
  });

  // Add the main content file
  dst_zip.file(CONTENT_FILE, JSON.stringify(dst_xmind));

  // Save the zip file
  dst_zip.generateAsync({type: 'nodebuffer'}).then((content) => {
    try {
      fs.writeFileSync(args.dst_xmind, content);
    }
    catch(error) {
      console.log('Error (' + error.message + ')');
      process.exit();
    }
    console.log('Done');
    console.log('\nThe merged XMind file is in ' + args.dst_xmind);
  });
}


// Merge the JSON in src_json to the master content, updaing the error
// list if necessary. src_xmind is for error reporting purposes only,
// src_zip is for extracting any additional resource content (like images)
// Returns '+' on success, '?' on warning, and 'x' on failure
function merge_content(src_json, src_xmind, src_zip) {
  var status = '+';
  try {
    // Parse the source JSON
    // Note that only grabs the first sheet in the XMind workbook
    var src_obj = JSON.parse(src_json)[0];
  }
  catch(error) {
    // JSON parse error (or no sheet found)
    status = 'x';
    src_errors.push('Unable to parse JSON in \'' + src_xmind + '\': ' + error.message);
  }
  if(status === '+') {
    // Grab only the root topic
    if(lod.has(src_obj, ROOT_TOPIC)) {
      // Replace all existing IDs with unique values
      var clean_obj = lod.deeply(lod.mapValues)(src_obj[ROOT_TOPIC], (val, key) => {
        if(key === 'id') {
          val = uuidv4();
        }
        return val;
      });

      // Grab any resources (like images or attached files)
      var resource_count = 0;
      src_zip.folder(RESOURCES_DIR).forEach((res_path, res_file) => {
        dst_resources[res_path] = 'saving';
        resource_count++;
        res_file.async('nodebuffer').then((data) => {
          fs.writeFileSync(path.join(TEMP_RESOURCES_DIR, res_path), data);
          dst_resources[res_path] = 'done';
          // DEBUG
          if(args.debug) {
            src_errors.push('DEBUG: added ' + res_path + ' from ' + src_xmind);
          }
        });
      });

      // Merge the content into the destination XMind
      // Add the attached and detached child topics
      var topic_count = 0;
      if(lod.has(clean_obj.children, 'attached') && lod.isArray(clean_obj.children.attached)) {
        // Add source attribution if necessary
        if(args.src_attr) {
          add_src_attr(clean_obj.children.attached, src_xmind);
        }

        dst_xmind[0][ROOT_TOPIC].children.attached = lod.concat(dst_xmind[0][ROOT_TOPIC].children.attached, clean_obj.children.attached);
        topic_count += clean_obj.children.attached.length;
      }
      else {
        status = '?';
        src_errors.push('No attached subtopics found in \'' + src_xmind + '\'');
      }

      if(lod.has(clean_obj.children, 'detached') && lod.isArray(clean_obj.children.detached)) {
        // Add source attribution if necessary
        if(args.src_attr) {
          add_src_attr(clean_obj.children.detached, src_xmind);
        }

        dst_xmind[0][ROOT_TOPIC].children.detached = lod.concat(dst_xmind[0][ROOT_TOPIC].children.detached, clean_obj.children.detached);
        topic_count += clean_obj.children.detached.length;
      }

      // Add the source root title and status to the merged workbooks detached topic
      var src_status = {
        'title': clean_obj.title,
        'id': uuidv4(),
        'children': {
          'attached': [
            {
              'title': 'Merged ' + topic_count + ' top-level topics',
              'id': uuidv4()
            }
          ]
        }
      };
      if(resource_count > 0) {
        src_status.children.attached.push({
          'title': 'Merged ' + resource_count + ' resources',
          'id': uuidv4()
        });
      }
      src_status.children.attached.push({
        'title': 'Source file was ' + src_xmind,
        'id': uuidv4()
      });
      dst_xmind[0][ROOT_TOPIC].children.detached[0].children.attached.push(src_status);      
    }
    else {
      // No root topic found
      status = 'x';
      src_errors.push('No root topic in \'' + src_xmind + '\'');
    }
  }
  return status;
}


// Update the dst_xmind object, folding the top-level attached branches
function fold_xmind() {
  dst_xmind[0][ROOT_TOPIC].children.attached.forEach((item, index) => {
    if(lod.has(item, 'children')) {
      dst_xmind[0][ROOT_TOPIC].children.attached[index]['branch'] = 'folded';
    }
  });
}


// Add source file attribution notes based on the filename passed in to each
// topic and its children (recursively if a deep merge is configured so that
// no context is lost)
function add_src_attr(topics, src_filename) {
  var note = SRC_ATTR_TAG + src_filename;

  topics.forEach((topic, index) => {
    // Recurse if a deeper merge will be performed and the topic has children
    if(args.deeper && lod.has(topic, 'children')) {
      if(lod.has(topic.children, 'attached')) {
        add_src_attr(topic.children.attached, src_filename);
      }

      if(lod.has(topic.children, 'detached')) {
        add_src_attr(topic.children.detached, src_filename);
      }
    }

    // Check if the topic already has a note attached
    if(lod.has(topic, 'notes')) {
      try {
        // The following makes some assumptions about the validity of the
        // existing note formatting, so put it in a try block to be safe
        topic.notes.plain.content = topic.notes.plain.content + '\n' + note;
        topic.notes.html.content.paragraphs.push({
          "spans": [
            {
              "text": note
            }
          ]
        });
        if(lod.has(topic.notes, 'ops')) {
          topic.notes.ops.ops.push({
            "insert": note + '\n'
          });
        }
      }
      catch(error) {
        // Something went wrong adding to the existing note, save the issue to
        // report later
        src_errors.push('Unable to add to existing note in ' + src_filename + ': ' + error.message);
      }
    }
    else {
      // Add a new note
      topic.notes = {
        "plain": {
          "content": note
        },
        "ops": {
          "ops": [
            {
              "insert": note + '\n'
            }
          ]
        },
        "html": {
          "content": {
            "paragraphs": [
              {
                "spans": [
                  {
                    "text": note
                  }
                ]
              }
            ]
          }
        }
      };
    }
  });
}

// Consolidate matching top-level topics in the dst_xmind object, returning
// the number of consolidations
// Note that this is similar to the XMind Pro merge capability, but doesn't
// recursively consolidate past the top-level topics and also doesn't try to
// consolidate detached (i.e. floating) topics
function consolidate_xmind() {
  var new_attached = [];
  var count = 0;

  dst_xmind[0][ROOT_TOPIC].children.attached.forEach((item, index) => {
    var match = match_topic(item, new_attached);
    if(match !== -1) {
      // Item topic matches, begin consolidation
      count++;

      // Merge any top-level notes so they aren't lost through consolidation
      if(lod.has(item, 'notes')) {
        if(lod.has(new_attached[match], 'notes')) {
          // Existing notes to merge with
          try {
            // The following makes some assumptions about the validity of the
            // note formatting, so put it in a try block to be safe
            new_attached[match].notes.plain.content = new_attached[match].notes.plain.content + '\n' + item.notes.plain.content;
            new_attached[match].notes.html.content.paragraphs = lod.concat(new_attached[match].notes.html.content.paragraphs, item.notes.html.content.paragraphs);
            if(lod.has(item.notes, 'ops')) {
              if(lod.has(new_attached[match].notes, 'ops')) {
                new_attached[match].notes.ops.ops = lod.concat(new_attached[match].notes.ops.ops, item.notes.ops.ops);
              }
              else {
                new_attached[match].notes.ops = item.notes.ops;
              }
            }
          }
          catch(error) {
            // Something went wrong merging into the existing note
            console.log('Warning: Unable to merge notes within top-level topic \'' + new_attached[match].title + '\', possible note data loss: ' + error.message);
          }
        }
        else {
          // No existing notes
          new_attached[match].notes = item.notes;
        }
      }

      if(lod.has(item, 'children') && lod.has(item.children, 'attached') && lod.isArray(item.children.attached)) {
        // Item has children that need merging
        if(lod.has(new_attached[match], 'children') && lod.has(new_attached[match].children, 'attached') && lod.isArray(new_attached[match].children.attached)) {
          // Existing children to concat with
          new_attached[match].children.attached = lod.concat(new_attached[match].children.attached, item.children.attached);
        }
        else {
          // No existing children to concat with, add children property if necessary
          if(!lod.has(new_attached[match], 'children')) {
            new_attached[match].children = {};
          }
          new_attached[match].children.attached = item.children.attached;
        }
      }
        // If the item doesn't have children it is dropped since it already exists as a topic
    }
    else {
      // Item topic doesn't match so needs to be added
      new_attached.push(item);
    }
  });

  // Substitute new topic tree with consolidations if any are found
  if(count > 0) {
    dst_xmind[0][ROOT_TOPIC].children.attached = new_attached;
  }

  return count;
}


// Return the index of the matching topic object in list or -1 if not found
// Note that this is case-insensitive for better topic title matching
function match_topic(topic, list) {
  return list.findIndex((item) => {
    if(lod.has(item, 'title') && lod.has(topic, 'title') && item.title.toUpperCase() === topic.title.toUpperCase()) {
      return true;
    }
  });
}


// Sort the topics in the dst_xmind object
function sort_topics() {
  sort_children(dst_xmind[0][ROOT_TOPIC]);
}


// Sort the passed in object based on its title and recurse down into its
// children if it has any (only attached topics are sorted)
function sort_children(obj) {
  if(lod.has(obj, 'children') && lod.has(obj.children, 'attached') && lod.isArray(obj.children.attached)) {
    obj.children.attached = lod.sortBy(obj.children.attached, ['title']);
    for(let i=0; i < obj.children.attached.length; i++) {
      sort_children(obj.children.attached[i]);
    }
  }
}
