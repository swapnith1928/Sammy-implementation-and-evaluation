#include <node_api.h>
#include <sys/socket.h>

napi_value SetPacingRate(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];

    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    int32_t fd;
    int64_t rate;

    napi_get_value_int32(env, args[0], &fd);
    napi_get_value_int64(env, args[1], &rate);

    setsockopt(fd, SOL_SOCKET, SO_MAX_PACING_RATE, &rate, sizeof(rate));

    napi_value result;
    napi_create_int32(env, 0, &result);
    return result;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_value fn;
    napi_create_function(env, NULL, 0, SetPacingRate, NULL, &fn);
    napi_set_named_property(env, exports, "setPacingRate", fn);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)