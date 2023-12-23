idf_component_register(SRCS "main.c" "socket_task.c" "wifi.c"
                    INCLUDE_DIRS ""
                    EMBED_TXTFILES server_root_cert.pem myselfsignedcert.pem)
