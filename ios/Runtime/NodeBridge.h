#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface NodeBridge : NSObject
// Blocking call: invoke on a dedicated thread, once per app process.
+ (int)startWithArguments:(NSArray<NSString *> *)arguments
             environment:(NSDictionary<NSString *, NSString *> *)environment
        workingDirectory:(NSString *)workingDirectory NS_SWIFT_NAME(start(withArguments:environment:workingDirectory:));
@end
NS_ASSUME_NONNULL_END
