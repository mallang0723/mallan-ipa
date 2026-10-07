#import "NodeBridge.h"
#include <NodeMobile/NodeMobile.h>
#include <atomic>
#include <vector>
#include <cstring>
#include <cstdlib>
#include <unistd.h>

@implementation NodeBridge
+ (int)startWithArguments:(NSArray<NSString *> *)arguments
             environment:(NSDictionary<NSString *, NSString *> *)environment
        workingDirectory:(NSString *)workingDirectory {
    static std::atomic<bool> started{false};
    if (started.exchange(true)) return -2;
    for (NSString *name in environment) {
        if (setenv(name.UTF8String, environment[name].UTF8String, 1) != 0) return -3;
    }
    if (chdir(workingDirectory.fileSystemRepresentation) != 0) return -4;
    // libuv requires argv strings in one contiguous buffer.
    size_t size = 0;
    for (NSString *arg in arguments) size += strlen(arg.UTF8String) + 1;
    std::vector<char> buffer(size);
    std::vector<char *> argv(arguments.count + 1, nullptr);
    char *cursor = buffer.data();
    NSUInteger index = 0;
    for (NSString *arg in arguments) {
        size_t length = strlen(arg.UTF8String) + 1;
        memcpy(cursor, arg.UTF8String, length);
        argv[index++] = cursor;
        cursor += length;
    }
    return node_start((int)arguments.count, argv.data());
}
@end
