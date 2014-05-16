namespace("sozi.editor.backend", function (exports) {
    "use strict";

    exports.GoogleDrive = exports.AbstractBackend.clone({
        // Configure these settings in sozi.editor.backend.GoogleDrive.config.js
        clientId: "Your OAuth client Id",
        apiKey: "Your developer API key",
        
        init: function (container) {
            exports.AbstractBackend.init.call(this, container, '<input id="sozi-editor-backend-GoogleDrive-input" type="button" value="Load from Google Drive">');
            gapi.client.setApiKey(this.apiKey);
            this.authorize(true);
            return this;
        },
        
        authorize: function (onInit) {
            var self = this;
            gapi.auth.authorize({
                client_id: this.clientId,
                scope: "https://www.googleapis.com/auth/drive",
                immediate: onInit
            }, function (authResult) {
                self.onAuthResult(authResult, onInit);
            });
        },
        
        onAuthResult: function (authResult, onInit) {
            var inputButton = $("#sozi-editor-backend-GoogleDrive-input");
            
            var self = this;
            
            if (authResult && !authResult.error) {
                this.accessToken = authResult.access_token;
                // Access granted: create a file picker and show the "Load" button.
                gapi.client.load("drive", "v2");
                gapi.load("picker", {
                    callback: function () {
                        self.createPicker();
                        inputButton.off("click").click(function () {
                            self.picker.setVisible(true);
                        });
                        if (!onInit) {
                            inputButton.click();
                        }
                    }
                });
            }
            else {
                // No access token could be retrieved, show the button to start the authorization flow.
                inputButton.click(function () {
                    self.authorize(false);
                });
            }
        },
        
        createPicker: function () {
            var self = this;
            
            this.picker = new google.picker.PickerBuilder().
                addView(google.picker.DocsView).
                setOAuthToken(this.accessToken).
                setDeveloperKey(this.apiKey).
                setCallback(function (data) {
                    if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
                        gapi.client.drive.files.get({fileId: data.docs[0].id}).execute(function (response) {
                            if (!response.error) {
                                self.load(response);
                            }
                            else {
                                console.log(response.error.message);
                            }
                        });
                    }
                }).
                build();
        },
        
        getName: function (fileDescriptor) {
            return fileDescriptor.title;
        },
        
        getLocation: function (fileDescriptor) {
            return fileDescriptor.parents;
        },
        
        find: function (name, location, callback) {
            function findInParent(index) {
                gapi.client.drive.files.list({
                    q: "title = '" + name + "' and " +
                       "'" + location[index].id + "' in parents"
                }).execute(function (response) {
                    if (response.items && response.items.length) {
                        callback(response.items[0]);
                    }
                    else if (index < location.length - 1) {
                        findInParent(index + 1);
                    }
                    else {
                        callback(null);
                    }
                });
            }
            findInParent(0);
        },
        
        // TODO implement the "change" event
        load: function (fileDescriptor) {
            // The file is loaded using an AJAX GET operation.
            // The data type is forced to "text" to prevent parsing it.
            // Fire the "load" event with the file content in case of success,
            // or with the error status in case of failure.
            $.ajax(fileDescriptor.downloadUrl, {
                contentType: fileDescriptor.mimeType,
                dataType: "text",
                headers: {
                    "Authorization": "Bearer " + this.accessToken
                },
                context: this
            }).done(function (data) {
                this.fire("load", fileDescriptor, data);
            }).fail(function (xhr, status) {
                this.fire("load", fileDescriptor, null, status);
            });
        },
        
        create: function (name, location, mimeType, data, callback) {
            var boundary = "-------314159265358979323846";
            var delimiter = "\r\n--" + boundary + "\r\n";
            var closeDelimiter = "\r\n--" + boundary + "--";

            var metadata = {
                title: name,
                parents: location,
                mimeType: mimeType
            };

            var multipartRequestBody =
                delimiter +
                "Content-Type: application/json\r\n\r\n" + JSON.stringify(metadata) +
                delimiter +
                "Content-Type: " + mimeType + "\r\n" +
                "Content-Transfer-Encoding: base64\r\n\r\n" +
                btoa(data) +
                closeDelimiter;

            gapi.client.request({
                path: "/upload/drive/v2/files",
                method: "POST",
                params: {
                    uploadType: "multipart"
                },
                headers: {
                  "Content-Type": 'multipart/mixed; boundary="' + boundary + '"'
                },
                body: multipartRequestBody
            }).execute(function (response) {
                if (!response.error) {
                    callback(response);
                }
                else {
                    callback(response, response.error.message);
                }
            });
        },
        
        // TODO implement saving
        save: function (fileDescriptor, data) {
            this.fire("save", fileDescriptor, "Not implemented");
        }
    });
});
